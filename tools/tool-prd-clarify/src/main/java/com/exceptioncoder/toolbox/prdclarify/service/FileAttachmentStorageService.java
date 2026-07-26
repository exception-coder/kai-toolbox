package com.exceptioncoder.toolbox.prdclarify.service;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * 需求描述附件（Word/PDF/Markdown 等）原始文件的落盘存储。
 *
 * <p>之前 {@link AttachmentParseService} 只提取文本拼进 rawInput，原始文件解析完就被丢弃——
 * 用户后续回看 PRD/草稿时只能看到抽取出来的纯文本，找不到当初提需求时上传的那份 Word/PDF
 * 原始文件。现在解析文本的同时把原始文件也落盘（见
 * {@code PrdClarifyController#parseAttachment}），返回的下载链接以 Markdown 语法
 * {@code [📎 附件：filename](url)} 插进 rawInput，跟粘贴图片
 * （{@link ImageAttachmentStorageService}）走的是同一套"落盘 + 链接嵌进正文"思路。
 *
 * <p>故意不跟 {@link ImageAttachmentStorageService} 共用同一个 Service：那边校验的是
 * {@code image/*}，这里校验的是文档类型，硬塞进一个类反而两边都要加分支判断；独立一份
 * 更清楚，也不会因为改这边的逻辑牵连粘贴图片已经稳定工作的路径。</p>
 */
@Service
public class FileAttachmentStorageService {

    private static final Logger log = LoggerFactory.getLogger(FileAttachmentStorageService.class);
    /** 比图片附件（20MB）宽松一些：Word/PDF 需求文档偶尔会带较多图片/排版，体积更大。 */
    private static final long MAX_BYTES = 30L * 1024 * 1024;

    private final Path root;

    public FileAttachmentStorageService() {
        this.root = Path.of(System.getProperty("user.home"), ".kai-toolbox", "prd", "file-attachments")
                .toAbsolutePath().normalize();
    }

    @PostConstruct
    public void init() throws IOException {
        Files.createDirectories(root);
        log.info("[prd-clarify] 文件附件目录：{}", root);
    }

    /** 落盘结果：id 用于拼下载链接，url 是可直接用的相对地址。 */
    public record StoredFile(String id, String name, String mime, String url) {
    }

    /** 下载文件三元组。 */
    public record DownloadFile(Path path, String mime, String name) {
    }

    public StoredFile store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "文件为空");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(BAD_REQUEST, "文件超过 30MB 上限");
        }
        String id = "file_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        String name = sanitize(file.getOriginalFilename());
        Path dir = resolveDir(id);
        try {
            Files.createDirectories(dir);
            Files.copy(file.getInputStream(), dir.resolve(name));
        } catch (IOException e) {
            throw new UncheckedIOException("文件落盘失败", e);
        }
        String mime = file.getContentType() != null ? file.getContentType() : "application/octet-stream";
        return new StoredFile(id, name, mime, url(id));
    }

    public DownloadFile locate(String id) {
        Path dir = resolveDir(id);
        if (!Files.isDirectory(dir)) {
            throw new ResponseStatusException(NOT_FOUND, "文件不存在");
        }
        try (var stream = Files.list(dir)) {
            Path file = stream.filter(Files::isRegularFile).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "文件不存在"));
            String mime = probe(file);
            return new DownloadFile(file, mime, file.getFileName().toString());
        } catch (IOException e) {
            throw new UncheckedIOException("读取文件失败", e);
        }
    }

    /** 越权防护：解析后的目录必须仍在 root 下。 */
    private Path resolveDir(String id) {
        Path dir = root.resolve(id).normalize();
        if (!dir.startsWith(root)) {
            throw new ResponseStatusException(BAD_REQUEST, "非法附件 id");
        }
        return dir;
    }

    private static String probe(Path file) {
        try {
            String m = Files.probeContentType(file);
            return m != null ? m : "application/octet-stream";
        } catch (IOException e) {
            return "application/octet-stream";
        }
    }

    private static String sanitize(String original) {
        if (original == null || original.isBlank()) {
            return "attachment";
        }
        String base = Path.of(original).getFileName().toString();
        return base.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private static String url(String id) {
        return "/api/prd-clarify/attachments/file/" + id;
    }
}
