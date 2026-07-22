package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.ConsultAttachmentView;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Set;

/**
 * 咨询附件落盘服务。文件写到所选系统源码目录下（引擎 cwd 内）或用户目录，返回绝对路径，
 * 由悬浮会话把路径投喂给引擎自行 Read（与 claude-chat 附件同一范式，但不依赖 chat.sessionId）。
 */
@Service
public class ConsultAttachmentService {

    private static final long MAX_BYTES = 30L * 1024 * 1024; // 30MB
    private static final Set<String> BLOCKED = Set.of("exe", "bat", "cmd", "com", "scr", "msi", "sh", "ps1", "jar", "dll");
    private static final String ATTACH_DIR = ".kai-chat-attachments";

    public ConsultAttachmentView store(String cwd, MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "文件不能为空");
        }
        String name = sanitize(file.getOriginalFilename());
        if (BLOCKED.contains(ext(name))) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "不支持的文件类型");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "文件过大（上限 30MB）");
        }

        Path dir;
        if (cwd != null && !cwd.isBlank() && Files.isDirectory(Path.of(cwd))) {
            dir = Path.of(cwd, ATTACH_DIR, "consult");
        } else {
            dir = Path.of(System.getProperty("user.home"), ".kai-toolbox", "consult-attachments");
        }
        Files.createDirectories(dir);
        Path target = dir.resolve(System.currentTimeMillis() + "-" + name);
        try (var in = file.getInputStream()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
        String mime = file.getContentType();
        if (mime == null) {
            mime = Files.probeContentType(target);
        }
        return new ConsultAttachmentView(name, target.toAbsolutePath().toString(), mime, file.getSize());
    }

    /** 去掉路径分隔符，只留纯文件名，兜底 "file"。 */
    private static String sanitize(String raw) {
        if (raw == null || raw.isBlank()) {
            return "file";
        }
        String n = raw.replace('\\', '/');
        int slash = n.lastIndexOf('/');
        if (slash >= 0) {
            n = n.substring(slash + 1);
        }
        n = n.trim();
        return n.isEmpty() ? "file" : n;
    }

    private static String ext(String name) {
        int dot = name.lastIndexOf('.');
        return dot >= 0 ? name.substring(dot + 1).toLowerCase() : "";
    }
}
