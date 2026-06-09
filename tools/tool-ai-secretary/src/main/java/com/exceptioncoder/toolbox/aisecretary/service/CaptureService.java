package com.exceptioncoder.toolbox.aisecretary.service;

import com.exceptioncoder.toolbox.aisecretary.ai.CaptureResult;
import com.exceptioncoder.toolbox.aisecretary.ai.CapturedItem;
import com.exceptioncoder.toolbox.aisecretary.ai.Capturer;
import com.exceptioncoder.toolbox.aisecretary.api.dto.CaptureResponse;
import com.exceptioncoder.toolbox.aisecretary.api.dto.NoteView;
import com.exceptioncoder.toolbox.aisecretary.domain.Note;
import com.exceptioncoder.toolbox.aisecretary.domain.NoteCategory;
import com.exceptioncoder.toolbox.aisecretary.repository.NoteRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
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
    private final ObjectMapper objectMapper;

    public CaptureService(Capturer capturer, NoteRepository repo, ObjectMapper objectMapper) {
        this.capturer = capturer;
        this.repo = repo;
        this.objectMapper = objectMapper;
    }

    public CaptureResponse capture(String rawText) {
        if (!StringUtils.hasText(rawText)) {
            throw new IllegalArgumentException("输入不能为空");
        }
        String text = rawText.trim();
        List<Note> stored = new ArrayList<>();
        boolean degraded = false;

        try {
            CaptureResult result = capturer.capture(Instant.now().toString(), CATEGORY_LABELS, text);
            List<CapturedItem> items = result == null ? null : result.items();
            if (items == null || items.isEmpty()) {
                degraded = true;
                stored.add(storeFallback(text));
            } else {
                for (CapturedItem item : items) {
                    stored.add(storeItem(text, item));
                }
            }
        } catch (Exception e) {
            // 抗造点③：模型乱答/解析失败 → 降级为未分类笔记
            log.warn("[ai-secretary] 结构化抽取失败，降级为未分类笔记: {}", e.toString());
            degraded = true;
            stored.add(storeFallback(text));
        }

        List<NoteView> views = stored.stream().map(this::toView).toList();
        return new CaptureResponse(degraded, views);
    }

    public List<NoteView> recent(int limit) {
        return repo.findRecent(limit).stream().map(this::toView).toList();
    }

    private Note storeItem(String rawText, CapturedItem item) {
        NoteCategory category = NoteCategory.fromLabel(item.category());
        double confidence = item.confidence() == null ? 0.0 : item.confidence();
        boolean needsReview = confidence < REVIEW_THRESHOLD || category == NoteCategory.UNCATEGORIZED;
        String title = StringUtils.hasText(item.title()) ? item.title().trim() : oneLine(rawText);

        Note note = new Note(
                UUID.randomUUID().toString(),
                rawText,
                category,
                title,
                trimToNull(item.dueTime()),
                item.amount(),
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
                n.createdAt());
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

    private static String trimToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }

    private static String oneLine(String raw) {
        String s = raw.strip().replaceAll("\\s+", " ");
        return s.length() <= 40 ? s : s.substring(0, 40) + "…";
    }
}
