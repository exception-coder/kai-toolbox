package com.exceptioncoder.toolbox.aisecretary.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;

/**
 * AI 秘书附件落盘：存到 {@code ${toolbox.data-dir}/ai-secretary/attachments/}，
 * 元数据由 {@link com.exceptioncoder.toolbox.aisecretary.repository.AttachmentRepository} 入库。
 * 参考 claude-chat 的 AttachmentStorageService：sanitize 文件名 + 危险扩展名黑名单。
 */
@Service
public class AttachmentStorageService {

    private static final Logger log = LoggerFactory.getLogger(AttachmentStorageService.class);

    private static final Set<String> BLOCKED_EXT = Set.of(
            "exe", "bat", "cmd", "com", "scr", "msi", "sh", "ps1", "jar", "dll");

    private final Path baseDir;

    public AttachmentStorageService(@Value("${toolbox.data-dir}") String dataDir) {
        this.baseDir = Path.of(dataDir, "ai-secretary", "attachments");
    }

    public StoredFile store(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("空文件");
        }
        String name = sanitize(file.getOriginalFilename());
        if (BLOCKED_EXT.contains(ext(name))) {
            throw new IllegalArgumentException("不支持的文件类型：" + ext(name));
        }
        Files.createDirectories(baseDir);
        Path target = baseDir.resolve(System.currentTimeMillis() + "-" + name);
        file.transferTo(target.toFile());

        String mime = file.getContentType() != null ? file.getContentType()
                : Files.probeContentType(target);
        log.info("[ai-secretary] 附件落盘 {} ({} bytes) -> {}", name, file.getSize(), target);
        return new StoredFile(name, mime, file.getSize(), target.toAbsolutePath().toString());
    }

    private static String sanitize(String original) {
        if (original == null || original.isBlank()) {
            return "file";
        }
        String base = original.replace('\\', '/');
        int slash = base.lastIndexOf('/');
        if (slash >= 0) {
            base = base.substring(slash + 1);
        }
        base = base.replaceAll("[\\x00-\\x1f]", "").replace("..", "").trim();
        if (base.isBlank()) {
            base = "file";
        }
        return base.length() > 120 ? base.substring(base.length() - 120) : base;
    }

    private static String ext(String name) {
        int dot = name.lastIndexOf('.');
        return dot >= 0 ? name.substring(dot + 1).toLowerCase() : "";
    }
}
