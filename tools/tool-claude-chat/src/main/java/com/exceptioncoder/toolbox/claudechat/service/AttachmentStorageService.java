package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.AttachmentView;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatAttachment;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatAttachmentRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner.ImageInput;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * 附件落盘：存到会话 cwd 下的 {@code .kai-chat-attachments/{sessionId}/} 目录，
 * 使 sidecar 里的 Claude 能用 Read 直接读取。会话删除时清空对应目录。
 */
@Slf4j
@Service("claudeChatAttachmentStorageService")
public class AttachmentStorageService {

    /** 附件目录名（相对会话 cwd），隐藏目录避免干扰工作区。 */
    static final String ATTACH_DIR = ".kai-chat-attachments";

    /** 危险可执行扩展名黑名单，拒绝上传。 */
    private static final Set<String> BLOCKED_EXT = Set.of(
            "exe", "bat", "cmd", "com", "scr", "msi", "sh", "ps1", "jar", "dll");
    private static final Set<String> IMAGE_MIME_TYPES = Set.of(
            "image/png", "image/jpeg", "image/gif", "image/webp");
    private static final long MAX_TOTAL_IMAGE_INPUT_BYTES = 25L * 1024 * 1024;

    private final ClaudeChatProperties props;
    private final ClaudeChatSessionRepository repo;
    private final ClaudeChatAttachmentRepository attachmentRepository;

    @Autowired
    public AttachmentStorageService(ClaudeChatProperties props, ClaudeChatSessionRepository repo,
                                    ClaudeChatAttachmentRepository attachmentRepository) {
        this.props = props;
        this.repo = repo;
        this.attachmentRepository = attachmentRepository;
    }

    AttachmentStorageService(ClaudeChatProperties props, ClaudeChatSessionRepository repo) {
        this(props, repo, null);
    }

    public AttachmentView store(String sessionId, MultipartFile file) throws IOException {
        String cwd = repo.findById(sessionId)
                .map(s -> s.getCwd())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "SESSION_NOT_FOUND"));

        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "EMPTY_FILE");
        }
        if (file.getSize() > props.getMaxAttachmentBytes()) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE");
        }

        String name = sanitize(file.getOriginalFilename());
        if (BLOCKED_EXT.contains(ext(name))) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_TYPE");
        }

        Path dir = Path.of(cwd, ATTACH_DIR, sessionId);
        Files.createDirectories(dir);
        Path target = dir.resolve(System.currentTimeMillis() + "-" + name);
        file.transferTo(target.toFile());

        String mime = file.getContentType() != null ? file.getContentType()
                : Files.probeContentType(target);
        String attachmentId = "att_" + UUID.randomUUID();
        long createdAt = System.currentTimeMillis();
        if (attachmentRepository == null) {
            throw new IllegalStateException("附件元数据仓储未初始化");
        }
        attachmentRepository.insert(new ClaudeChatAttachment(
                attachmentId, sessionId, name, mime, file.getSize(), target.getFileName().toString(), createdAt));
        log.info("[claude-chat] 附件落盘 {} ({} bytes) -> {}", name, file.getSize(), target);
        return new AttachmentView(
                attachmentId,
                name, mime, file.getSize(), target.toAbsolutePath().toString());
    }

    /**
     * 将当前会话附件目录中的受支持图片转换为模型图片输入。
     * 路径归属校验在读取字节前完成，浏览器不能借附件字段读取工作区任意文件。
     */
    public List<ImageInput> loadImages(String sessionId, List<ImageReference> references) {
        if (references == null || references.isEmpty()) return List.of();
        String cwd = repo.findById(sessionId)
                .map(session -> session.getCwd())
                .orElseThrow(() -> new IllegalArgumentException("会话不存在，无法读取附件"));
        Path allowedRoot = Path.of(cwd, ATTACH_DIR, sessionId).toAbsolutePath().normalize();
        List<ImageInput> images = new ArrayList<>();
        long totalBytes = 0;
        for (ImageReference reference : references) {
            Path file = resolveAttachmentFile(sessionId, allowedRoot, reference);
            String mime = imageMime(file, reference.mime());
            if (mime == null) continue;
            try {
                long size = Files.size(file);
                if (size <= 0 || size > props.getMaxAttachmentBytes()) {
                    throw new IllegalArgumentException("图片附件大小不符合要求：" + reference.name());
                }
                totalBytes += size;
                if (totalBytes > MAX_TOTAL_IMAGE_INPUT_BYTES) {
                    throw new IllegalArgumentException("本条消息的图片总大小超过 25MB，请分批发送");
                }
                images.add(new ImageInput(Base64.getEncoder().encodeToString(Files.readAllBytes(file)), mime));
            } catch (IOException exception) {
                throw new IllegalArgumentException("图片附件暂时无法读取：" + reference.name(), exception);
            }
        }
        return List.copyOf(images);
    }

    /** 通过逻辑附件 ID 解析归档图片；绝对路径不离开服务端。 */
    public ArchivedAttachment loadArchived(String sessionId, String attachmentId) {
        ClaudeChatAttachment attachment = attachmentRepository.find(sessionId, attachmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "ATTACHMENT_NOT_FOUND"));
        String cwd = repo.findById(sessionId).map(session -> session.getCwd())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "SESSION_NOT_FOUND"));
        Path root = Path.of(cwd, ATTACH_DIR, sessionId).toAbsolutePath().normalize();
        Path file = root.resolve(attachment.storagePath()).toAbsolutePath().normalize();
        if (!file.startsWith(root) || !Files.isRegularFile(file) || !Files.isReadable(file)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "ATTACHMENT_FILE_MISSING");
        }
        String mime = imageMime(file, attachment.mime());
        if (mime == null) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_IMAGE_TYPE");
        }
        return new ArchivedAttachment(attachment, file, mime);
    }

    private Path resolveAttachmentFile(String sessionId, Path allowedRoot, ImageReference reference) {
        if (reference.id() != null && !reference.id().isBlank()) {
            ClaudeChatAttachment attachment = attachmentRepository.find(sessionId, reference.id())
                    .orElseThrow(() -> new IllegalArgumentException("附件不属于当前会话：" + reference.name()));
            Path file = allowedRoot.resolve(attachment.storagePath()).toAbsolutePath().normalize();
            if (!file.startsWith(allowedRoot) || !Files.isRegularFile(file)) {
                throw new IllegalArgumentException("附件文件不可用：" + reference.name());
            }
            return file;
        }
        return safeAttachmentFile(allowedRoot, reference.path());
    }

    /** 公开环境检测只读检查，不创建目录或测试文件。 */
    public Capability capability(String sessionId) {
        return repo.findById(sessionId).map(session -> {
            try {
                Path cwd = Path.of(session.getCwd()).toAbsolutePath().normalize();
                boolean available = Files.isDirectory(cwd) && Files.isReadable(cwd) && Files.isWritable(cwd);
                return new Capability(available, available
                        ? "附件可以安全上传和读取"
                        : "附件目录当前不可用，请联系链接创建者检查评审空间");
            } catch (RuntimeException exception) {
                return new Capability(false, "附件目录当前不可用，请联系链接创建者检查评审空间");
            }
        }).orElseGet(() -> new Capability(false, "评审会话不存在，请联系链接创建者重新生成链接"));
    }

    private static Path safeAttachmentFile(Path allowedRoot, String rawPath) {
        if (rawPath == null || rawPath.isBlank()) throw new IllegalArgumentException("附件路径为空");
        try {
            Path file = Path.of(rawPath).toAbsolutePath().normalize();
            if (!file.startsWith(allowedRoot) || !Files.isRegularFile(file)) {
                throw new IllegalArgumentException("附件不属于当前评审会话");
            }
            return file;
        } catch (RuntimeException exception) {
            if (exception instanceof IllegalArgumentException illegalArgumentException) {
                throw illegalArgumentException;
            }
            throw new IllegalArgumentException("附件路径无效", exception);
        }
    }

    private static String imageMime(Path file, String declaredMime) {
        String detected = null;
        try {
            detected = Files.probeContentType(file);
        } catch (IOException ignored) {
            // Windows 对部分扩展名无法探测，继续使用上传时记录的媒体类型。
        }
        String mime = normalizeMime(detected);
        if (mime == null) mime = normalizeMime(declaredMime);
        if (mime == null) mime = mimeFromExtension(file);
        return IMAGE_MIME_TYPES.contains(mime) ? mime : null;
    }

    private static String normalizeMime(String mime) {
        if (mime == null || mime.isBlank()) return null;
        int separator = mime.indexOf(';');
        return (separator >= 0 ? mime.substring(0, separator) : mime).trim().toLowerCase(Locale.ROOT);
    }

    private static String mimeFromExtension(Path file) {
        return switch (ext(file.getFileName().toString())) {
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "gif" -> "image/gif";
            case "webp" -> "image/webp";
            default -> null;
        };
    }

    /** 删除某会话的附件目录（会话删除时调用）。cwd 由调用方提供，避免会话记录已删时查不到。 */
    public void clear(String cwd, String sessionId) {
        if (cwd == null || cwd.isBlank()) return;
        Path dir;
        try {
            dir = Path.of(cwd, ATTACH_DIR, sessionId);
        } catch (RuntimeException e) {
            // cwd 畸形（如两段路径拼接、含非法字符）→ 没有合法附件目录可清，直接跳过，不阻断会话删除
            log.debug("[claude-chat] 附件目录路径非法，跳过清理：{}", cwd);
            return;
        }
        if (!Files.exists(dir)) return;
        try (var paths = Files.walk(dir)) {
            paths.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException e) {
                    log.debug("[claude-chat] 删除附件失败 {}: {}", p, e.toString());
                }
            });
        } catch (IOException e) {
            log.debug("[claude-chat] 清理附件目录失败 {}: {}", dir, e.toString());
        }
    }

    /** 取 basename、去 .. 与分隔符、限长，空名兜底。 */
    private static String sanitize(String original) {
        if (original == null || original.isBlank()) return "file";
        String base = original.replace('\\', '/');
        int slash = base.lastIndexOf('/');
        if (slash >= 0) base = base.substring(slash + 1);
        base = base.replaceAll("[\\x00-\\x1f]", "").replace("..", "").trim();
        if (base.isBlank()) base = "file";
        return base.length() > 120 ? base.substring(base.length() - 120) : base;
    }

    private static String ext(String name) {
        int dot = name.lastIndexOf('.');
        return dot >= 0 ? name.substring(dot + 1).toLowerCase() : "";
    }

    public record ImageReference(String id, String name, String path, String mime) {
        public ImageReference(String name, String path, String mime) {
            this(null, name, path, mime);
        }
    }

    public record ArchivedAttachment(ClaudeChatAttachment metadata, Path file, String mime) {
    }

    public record Capability(boolean available, String message) {}
}
