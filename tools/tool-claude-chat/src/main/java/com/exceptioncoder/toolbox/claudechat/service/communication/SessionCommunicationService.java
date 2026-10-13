package com.exceptioncoder.toolbox.claudechat.service.communication;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatAttachment;
import com.exceptioncoder.toolbox.claudechat.api.dto.AttachmentView;
import com.exceptioncoder.toolbox.claudechat.domain.communication.CommunicationRecord;
import com.exceptioncoder.toolbox.claudechat.domain.communication.CommunicationRecord.*;
import com.exceptioncoder.toolbox.claudechat.repository.communication.SessionCommunicationRepository;
import com.exceptioncoder.toolbox.claudechat.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SessionPlanStateService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** 人工收集的沟通资料闭环，不启动模型或修改规格。 */
@Service("claudeChatSessionCommunicationService")
public class SessionCommunicationService {
    public static final int MAX_IMAGES = 10;
    public static final int MAX_REFERENCES = 5;
    private static final long MAX_IMAGE_BYTES = 25L * 1024 * 1024;
    private final SessionCommunicationRepository repository;
    private final AttachmentStorageService attachments;
    private final ClaudeChatSessionAccessPolicy access;
    private final SessionPlanStateService plans;

    public SessionCommunicationService(SessionCommunicationRepository repository, AttachmentStorageService attachments,
                                       ClaudeChatSessionAccessPolicy access, SessionPlanStateService plans) {
        this.repository = repository;
        this.attachments = attachments;
        this.access = access;
        this.plans = plans;
    }

    public Page list(String sessionId, Filter filter) {
        authorize(sessionId, false);
        Filter normalized = new Filter(text(filter.search(), 120, "搜索词"), filter.order(), filter.notes(),
                filter.removed(), filter.page());
        if (normalized.page() < 0 || normalized.page() >= SessionCommunicationRepository.MAX_RECORDS / SessionCommunicationRepository.PAGE_SIZE
                || !Set.of("asc", "desc").contains(normalized.order())
                || !Set.of("all", "with", "without").contains(normalized.notes())) {
            throw badRequest("分页或筛选值无效");
        }
        List<Summary> records = repository.list(sessionId, normalized).stream().map(row -> new Summary(
                row.id(), row.title(), row.occurredAt(), row.source(), row.participants(), row.originalText(),
                row.notes(), row.attachmentIds().size(), row.version(), row.deletedAt(), row.updatedAt())).toList();
        return new Page(records, repository.count(sessionId, normalized), normalized.page(), SessionCommunicationRepository.PAGE_SIZE);
    }

    public Detail detail(String sessionId, String id) {
        authorize(sessionId, false);
        CommunicationRecord record = required(sessionId, id);
        var found = attachments.archivedMetadataBatch(sessionId, record.attachmentIds()).stream()
                .collect(Collectors.toMap(ClaudeChatAttachment::id, value -> value));
        List<Image> images = record.attachmentIds().stream().map(attachmentId -> {
            ClaudeChatAttachment image = found.get(attachmentId);
            return image == null ? new Image(attachmentId, "图片已不存在", "", 0)
                    : new Image(image.id(), image.name(), image.mime(), image.size());
        }).toList();
        return new Detail(record, images);
    }

    @Transactional
    public Detail save(String sessionId, String id, Input raw) {
        authorize(sessionId, true);
        validateId(id);
        Input input = normalize(raw);
        CommunicationRecord existing = repository.find(sessionId, id).orElse(null);
        if (existing != null && existing.deletedAt() == null && existing.sameContent(input)) return detail(sessionId, id);
        if (existing != null && (existing.deletedAt() != null || existing.version() != input.expectedVersion())) throw conflict();
        if (existing == null && input.expectedVersion() != 0) throw conflict();
        validateImages(attachments.loadArchivedBatch(sessionId, input.attachmentIds()));
        boolean saved = existing == null ? repository.insert(sessionId, id, input) : repository.update(sessionId, id, input);
        if (!saved) throw new ResponseStatusException(HttpStatus.CONFLICT, "保存未生效：记录已变化，或本会话已达到 1000 条上限。请刷新核对后重试");
        return detail(sessionId, id);
    }

    @Transactional
    public Detail setRemoved(String sessionId, String id, int expectedVersion, boolean removed) {
        authorize(sessionId, true);
        CommunicationRecord existing = required(sessionId, id);
        if ((existing.deletedAt() != null) == removed) return detail(sessionId, id);
        if (existing.version() != expectedVersion || !repository.setRemoved(sessionId, id, expectedVersion, removed)) throw conflict();
        return detail(sessionId, id);
    }

    public Reference reference(String sessionId, List<String> recordIds) {
        authorize(sessionId, true);
        if (recordIds == null || recordIds.isEmpty() || recordIds.size() > MAX_REFERENCES
                || recordIds.stream().distinct().count() != recordIds.size()) throw badRequest("请选择 1–5 条不同的沟通记录");
        recordIds.forEach(this::validateId);
        var found = repository.findMany(sessionId, recordIds).stream()
                .collect(Collectors.toMap(CommunicationRecord::id, value -> value));
        if (found.size() != recordIds.size()) throw badRequest("记录不属于当前会话，或已被移除。请刷新列表");
        List<CommunicationRecord> ordered = recordIds.stream().map(found::get).toList();
        var owners = new LinkedHashMap<String, String>();
        for (CommunicationRecord row : ordered) for (String image : row.attachmentIds()) owners.putIfAbsent(image, row.id());
        if (owners.size() > MAX_IMAGES) throw badRequest("引用的图片超过 10 张，请分批选择记录");
        List<AttachmentStorageService.ArchivedAttachment> images = attachments.loadArchivedBatch(sessionId, List.copyOf(owners.keySet()));
        validateImages(images);
        List<ReferenceImage> views = images.stream().map(image -> new ReferenceImage(image.metadata().id(),
                image.metadata().name(), image.mime(), image.metadata().size(), image.file().toString(),
                owners.get(image.metadata().id()))).toList();
        return new Reference(ordered, views);
    }

    public AttachmentStorageService.ArchivedAttachment image(String sessionId, String id, String attachmentId) {
        authorize(sessionId, false);
        CommunicationRecord record = required(sessionId, id);
        if (!record.attachmentIds().contains(attachmentId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "图片不属于该沟通记录");
        var image = attachments.loadArchived(sessionId, attachmentId);
        validateImages(List.of(image));
        return image;
    }

    public AttachmentView uploadImage(String sessionId, MultipartFile file) throws IOException {
        authorize(sessionId, true);
        if (file == null || file.isEmpty() || file.getSize() > MAX_IMAGE_BYTES) throw badRequest("截图不能为空，且不能超过 25 MiB");
        AttachmentView result = attachments.store(sessionId, file);
        validateImages(attachments.loadArchivedBatch(sessionId, List.of(result.id())));
        return result;
    }

    private void authorize(String sessionId, boolean write) {
        boolean allowed = write ? access.canAccessOrClaimCurrentUser(sessionId) : access.canAccessCurrentUser(sessionId);
        if (!allowed) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前用户不能访问该会话");
        if (write && !plans.writable(sessionId)) throw new ResponseStatusException(HttpStatus.CONFLICT, "会话已锁定，沟通流水仅可查看");
    }

    private CommunicationRecord required(String sessionId, String id) {
        validateId(id);
        return repository.find(sessionId, id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "沟通记录不存在，请返回列表重新选择"));
    }

    private void validateId(String id) {
        try {
            if (!UUID.fromString(id).toString().equals(id)) throw badRequest("记录编号无效");
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw badRequest("记录编号无效");
        }
    }

    private Input normalize(Input raw) {
        if (raw == null) throw badRequest("请填写沟通记录");
        String title = text(raw.title(), 160, "主题");
        String original = materialText(raw.originalText(), "原文");
        String notes = materialText(raw.notes(), "整理备注");
        List<String> ids = raw.attachmentIds() == null ? List.of() : raw.attachmentIds();
        if (title.isEmpty() || (original.isEmpty() && notes.isEmpty() && ids.isEmpty())) throw badRequest("请填写主题及原文、备注或截图");
        if (raw.occurredAt() <= 0 || raw.occurredAt() > 4102444800000L || raw.expectedVersion() < 0) throw badRequest("沟通时间或版本无效");
        if (ids.size() > MAX_IMAGES || ids.stream().anyMatch(id -> id == null || !id.matches("att_[a-zA-Z0-9-]{1,80}"))
                || ids.stream().distinct().count() != ids.size()) throw badRequest("图片关联无效，最多 10 张不同的图片");
        String url = text(raw.sourceUrl(), 2000, "来源链接");
        if (!url.isEmpty()) {
            try {
                URI uri = URI.create(url);
                if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null || uri.getUserInfo() != null) throw badRequest("来源链接需为 HTTP/HTTPS 地址");
            } catch (IllegalArgumentException exception) { throw badRequest("来源链接无效"); }
        }
        return new Input(title, raw.occurredAt(), text(raw.source(), 100, "来源"), text(raw.participants(), 300, "参与人"),
                url, original, notes, List.copyOf(ids), raw.expectedVersion());
    }

    private void validateImages(List<AttachmentStorageService.ArchivedAttachment> images) {
        long total = 0;
        for (var image : images) {
            try (var input = Files.newInputStream(image.file())) {
                total += Files.size(image.file());
                if (total > MAX_IMAGE_BYTES) throw badRequest("图片合计超过 25 MiB，请分批整理");
                byte[] header = input.readNBytes(12);
                if (!rasterHeader(header, image.mime())) throw badRequest("截图需为真实的 PNG、JPEG、GIF 或 WebP 图片");
                if (!image.file().toRealPath().startsWith(image.file().getParent().toRealPath())) throw badRequest("图片路径归属无效");
            } catch (IOException exception) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "图片暂时无法读取，请检查文件或移除该图片后重试", exception);
            }
        }
    }

    private boolean rasterHeader(byte[] header, String mime) {
        if (header.length < 12) return false;
        return switch (mime) {
            case "image/png" -> java.util.Arrays.equals(java.util.Arrays.copyOf(header, 8), new byte[]{(byte)137, 80, 78, 71, 13, 10, 26, 10});
            case "image/jpeg" -> header[0] == (byte)255 && header[1] == (byte)216 && header[2] == (byte)255;
            case "image/gif" -> new String(header, 0, 6, StandardCharsets.US_ASCII).matches("GIF8[79]a");
            case "image/webp" -> new String(header, 0, 4, StandardCharsets.US_ASCII).equals("RIFF")
                    && new String(header, 8, 4, StandardCharsets.US_ASCII).equals("WEBP");
            default -> false;
        };
    }

    private String text(String raw, int max, String label) {
        String value = raw == null ? "" : raw.strip();
        if (value.length() > max) throw badRequest(label + "超出长度限制（" + max + " 字）");
        return value;
    }

    private String materialText(String raw, String label) {
        if (raw == null || raw.isBlank()) return "";
        if (raw.length() > 20000) throw badRequest(label + "超出长度限制（20000 字）");
        return raw;
    }

    private ResponseStatusException badRequest(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private ResponseStatusException conflict() { return new ResponseStatusException(HttpStatus.CONFLICT, "记录已在其他页面更新或移除。草稿未丢失，请重新读取并核对后保存"); }
}
