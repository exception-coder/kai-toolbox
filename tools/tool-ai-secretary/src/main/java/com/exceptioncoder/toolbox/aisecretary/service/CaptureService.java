package com.exceptioncoder.toolbox.aisecretary.service;

import com.exceptioncoder.toolbox.aisecretary.ai.CaptureResult;
import com.exceptioncoder.toolbox.aisecretary.ai.CapturedItem;
import com.exceptioncoder.toolbox.aisecretary.ai.Capturer;
import com.exceptioncoder.toolbox.aisecretary.api.dto.AttachmentView;
import com.exceptioncoder.toolbox.aisecretary.api.dto.CaptureResponse;
import com.exceptioncoder.toolbox.aisecretary.api.dto.NoteView;
import com.exceptioncoder.toolbox.aisecretary.domain.Attachment;
import com.exceptioncoder.toolbox.aisecretary.domain.Note;
import com.exceptioncoder.toolbox.aisecretary.domain.NoteCategory;
import com.exceptioncoder.toolbox.aisecretary.repository.AttachmentRepository;
import com.exceptioncoder.toolbox.aisecretary.repository.NoteRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 记录态核心：自由文本 → LLM 结构化抽取 → 归一化 → 落库。
 *
 * <p>健壮性（抗造）落点：
 * <ul>
 *   <li>① 多件事：CaptureResult.items 数组逐条入库</li>
 *   <li>② 分类不确定：confidence &lt; 阈值 或 未分类 → needsReview=true</li>
 *   <li>③ 结构化解析失败：捕获异常 → 整条降级为「未分类」笔记，绝不丢用户输入</li>
 * </ul>
 */
@Service
public class CaptureService {

    private static final Logger log = LoggerFactory.getLogger(CaptureService.class);
    private static final double REVIEW_THRESHOLD = 0.6;
    private static final String CATEGORY_LABELS = NoteCategory.labelsCsv();

    private final Capturer capturer;
    private final NoteRepository repo;
    private final AttachmentRepository attachmentRepo;
    private final ObjectMapper objectMapper;

    public CaptureService(Capturer capturer, NoteRepository repo,
                          AttachmentRepository attachmentRepo, ObjectMapper objectMapper) {
        this.capturer = capturer;
        this.repo = repo;
        this.attachmentRepo = attachmentRepo;
        this.objectMapper = objectMapper;
    }

    public CaptureResponse capture(String rawText) {
        StoreResult r = storeNotes(rawText);
        return new CaptureResponse(r.degraded(), r.notes().stream().map(this::toView).toList());
    }

    /** 记录态 + 附件：有文本走分类（可能拆多条），纯附件兜底为一条笔记；附件落到首条 note。 */
    public CaptureResponse captureWithAttachments(String text, List<StoredFile> files) {
        List<Note> notes;
        boolean degraded;
        if (StringUtils.hasText(text)) {
            StoreResult r = storeNotes(text);
            notes = r.notes();
            degraded = r.degraded();
        } else {
            notes = List.of(storeAttachmentOnlyNote(files));
            degraded = false;
        }
        if (!notes.isEmpty() && files != null && !files.isEmpty()) {
            String noteId = notes.get(0).id();
            long now = System.currentTimeMillis();
            for (StoredFile f : files) {
                attachmentRepo.insert(new Attachment(
                        UUID.randomUUID().toString(), noteId,
                        f.fileName(), f.mimeType(), f.sizeBytes(), f.storedPath(), now));
            }
        }
        return new CaptureResponse(degraded, notes.stream().map(this::toView).toList());
    }

    public List<NoteView> recent(int limit) {
        return repo.findRecent(limit).stream().map(this::toView).toList();
    }

    /** 删除一条记录：连带附件文件 + 附件行 + note 行。 */
    public void deleteNote(String id) {
        for (com.exceptioncoder.toolbox.aisecretary.domain.Attachment a : attachmentRepo.findByNoteId(id)) {
            try {
                java.nio.file.Files.deleteIfExists(java.nio.file.Path.of(a.storedPath()));
            } catch (Exception ignored) {
                // 文件删除失败不阻断元数据删除
            }
        }
        attachmentRepo.deleteByNoteId(id);
        repo.deleteById(id);
    }

    private record StoreResult(List<Note> notes, boolean degraded) {
    }

    /** 文本 → 结构化抽取 → 落库，返回 (notes, degraded)；capture / captureWithAttachments 共用。 */
    private StoreResult storeNotes(String rawText) {
        if (!StringUtils.hasText(rawText)) {
            throw new IllegalArgumentException("输入不能为空");
        }
        String text = rawText.trim();
        ZonedDateTime now = ZonedDateTime.now();
        List<Note> stored = new ArrayList<>();
        boolean degraded = false;
        try {
            CaptureResult result = capturer.capture(CaptureNormalizer.nowContext(now), CATEGORY_LABELS, text);
            List<CapturedItem> items = result == null ? null : result.items();
            if (items == null || items.isEmpty()) {
                degraded = true;
                stored.add(storeFallback(text));
            } else {
                for (CapturedItem item : items) {
                    stored.add(storeItem(text, item, now.getZone()));
                }
            }
        } catch (Exception e) {
            // 抗造点③：模型乱答/解析失败 → 降级为未分类笔记
            log.warn("[ai-secretary] 结构化抽取失败，降级为未分类笔记: {}", e.toString());
            degraded = true;
            stored.add(storeFallback(text));
        }
        return new StoreResult(stored, degraded);
    }

    /** 纯附件（无文本）：建一条「笔记」类目的 note 承载附件。 */
    private Note storeAttachmentOnlyNote(List<StoredFile> files) {
        String title = (files == null || files.isEmpty())
                ? "附件"
                : (files.size() == 1 ? files.get(0).fileName() : files.size() + " 个附件");
        Note note = new Note(
                UUID.randomUUID().toString(),
                "[附件] " + title,
                NoteCategory.NOTE,
                title,
                null, null, "[]", 1.0, false, "open",
                System.currentTimeMillis());
        repo.insert(note);
        return note;
    }

    private Note storeItem(String rawText, CapturedItem item, ZoneId zone) {
        NoteCategory category = NoteCategory.fromLabel(item.category());
        double confidence = item.confidence() == null ? 0.0 : item.confidence();
        String title = StringUtils.hasText(item.title()) ? item.title().trim() : oneLine(rawText);

        // 确定性护栏①：校验/归一化 LLM 给的时间；解析不了就丢弃并标待复核
        String dueTime = CaptureNormalizer.normalizeDueTime(item.dueTime(), zone);
        boolean dueDropped = StringUtils.hasText(item.dueTime()) && dueTime == null;

        // 确定性护栏②：开销类若 LLM 漏抽金额，用正则从原文兜底
        Double amount = item.amount() != null
                ? item.amount()
                : (category == NoteCategory.EXPENSE ? CaptureNormalizer.extractAmount(rawText) : null);

        boolean needsReview = confidence < REVIEW_THRESHOLD
                || category == NoteCategory.UNCATEGORIZED
                || dueDropped;

        Note note = new Note(
                UUID.randomUUID().toString(),
                rawText,
                category,
                title,
                dueTime,
                amount,
                toTagsJson(item.tags()),
                confidence,
                needsReview,
                "open",
                System.currentTimeMillis());
        repo.insert(note);
        return note;
    }

    private Note storeFallback(String rawText) {
        Note note = new Note(
                UUID.randomUUID().toString(),
                rawText,
                NoteCategory.UNCATEGORIZED,
                oneLine(rawText),
                null,
                null,
                "[]",
                0.0,
                true,
                "open",
                System.currentTimeMillis());
        repo.insert(note);
        return note;
    }

    private NoteView toView(Note n) {
        List<AttachmentView> atts = attachmentRepo.findByNoteId(n.id()).stream()
                .map(a -> new AttachmentView(a.id(), a.fileName(), a.mimeType(), a.sizeBytes()))
                .toList();
        return new NoteView(
                n.id(),
                n.rawText(),
                n.category().name(),
                n.category().label(),
                n.title(),
                n.dueTime(),
                n.amount(),
                parseTags(n.tagsJson()),
                n.confidence(),
                n.needsReview(),
                n.status(),
                n.createdAt(),
                atts);
    }

    private String toTagsJson(List<String> tags) {
        if (tags == null || tags.isEmpty()) {
            return "[]";
        }
        try {
            return objectMapper.writeValueAsString(tags);
        } catch (Exception e) {
            return "[]";
        }
    }

    private List<String> parseTags(String json) {
        if (!StringUtils.hasText(json)) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private static String oneLine(String raw) {
        String s = raw.strip().replaceAll("\\s+", " ");
        return s.length() <= 40 ? s : s.substring(0, 40) + "…";
    }
}
