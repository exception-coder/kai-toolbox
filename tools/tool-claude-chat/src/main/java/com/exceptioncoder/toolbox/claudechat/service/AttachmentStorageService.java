package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.AttachmentView;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Set;
import java.util.UUID;

/**
 * 附件落盘：存到会话 cwd 下的 {@code .kai-chat-attachments/{sessionId}/} 目录，
 * 使 sidecar 里的 Claude 能用 Read 直接读取。会话删除时清空对应目录。
 */
@Slf4j
@Service
public class AttachmentStorageService {

    /** 附件目录名（相对会话 cwd），隐藏目录避免干扰工作区。 */
    static final String ATTACH_DIR = ".kai-chat-attachments";

    /** 危险可执行扩展名黑名单，拒绝上传。 */
    private static final Set<String> BLOCKED_EXT = Set.of(
            "exe", "bat", "cmd", "com", "scr", "msi", "sh", "ps1", "jar", "dll");

    private final ClaudeChatProperties props;
    private final ClaudeChatSessionRepository repo;

    public AttachmentStorageService(ClaudeChatProperties props, ClaudeChatSessionRepository repo) {
        this.props = props;
        this.repo = repo;
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
        log.info("[claude-chat] 附件落盘 {} ({} bytes) -> {}", name, file.getSize(), target);
        return new AttachmentView(
                "att_" + UUID.randomUUID().toString().substring(0, 8),
                name, mime, file.getSize(), target.toAbsolutePath().toString());
    }

    /** 删除某会话的附件目录（会话删除时调用）。cwd 由调用方提供，避免会话记录已删时查不到。 */
    public void clear(String cwd, String sessionId) {
        if (cwd == null || cwd.isBlank()) return;
        Path dir = Path.of(cwd, ATTACH_DIR, sessionId);
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
}
