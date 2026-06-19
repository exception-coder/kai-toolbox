package com.exceptioncoder.toolbox.aichat.service;

import com.exceptioncoder.toolbox.aichat.api.dto.AttachmentRef;
import com.exceptioncoder.toolbox.aichat.api.dto.AttachmentView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * 图片附件落盘：扁平按 attachmentId 存于 {@code data-dir/ai-chat/attachments/{id}/{name}}。
 * 下载只凭 id 定位（无需会话 id）；删会话时由消息行的 {@link AttachmentRef} 反查删除。
 * 所有路径解析后做 {@code startsWith(root)} 越权防护。
 */
@Service("aiChatAttachmentStorageService")
public class AttachmentStorageService {

    private static final Logger log = LoggerFactory.getLogger(AttachmentStorageService.class);
    private static final long MAX_BYTES = 50L * 1024 * 1024;
    /** 视频文件较大,单独放宽上限。 */
    private static final long MAX_VIDEO_BYTES = 300L * 1024 * 1024;
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15)).build();

    private final Path root;

    public AttachmentStorageService(@Value("${toolbox.data-dir}") String dataDir) {
        this.root = Path.of(dataDir, "ai-chat", "attachments").toAbsolutePath().normalize();
    }

    /** 下载文件三元组。 */
    public record DownloadFile(Path path, String mime, String name) {
    }

    public AttachmentView store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "附件为空");
        }
        String mime = file.getContentType();
        if (mime == null || !mime.startsWith("image/")) {
            throw new ResponseStatusException(BAD_REQUEST, "仅支持图片附件");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(BAD_REQUEST, "图片超过 50MB 上限");
        }
        String id = "att_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        String name = sanitize(file.getOriginalFilename());
        Path dir = resolveDir(id);
        try {
            Files.createDirectories(dir);
            Files.copy(file.getInputStream(), dir.resolve(name));
        } catch (IOException e) {
            throw new UncheckedIOException("附件落盘失败", e);
        }
        return new AttachmentView(id, name, mime, url(id));
    }

    public AttachmentView storeFromUrl(String imageUrl) {
        return downloadAndStore(imageUrl, MAX_BYTES, "image/png");
    }

    /** 下载远端视频 URL 并落盘(放宽到视频上限)。 */
    public AttachmentView storeVideoFromUrl(String videoUrl) {
        return downloadAndStore(videoUrl, MAX_VIDEO_BYTES, "video/mp4");
    }

    /**
     * 下载远端 URL 并落盘为附件(媒体结果持久化用)。网关图床/视频 URL 会过期,
     * 故必须下载到本地才能「回看」。失败抛 ResponseStatusException 由调用方处理。
     */
    private AttachmentView downloadAndStore(String mediaUrl, long maxBytes, String defaultMime) {
        if (mediaUrl == null || mediaUrl.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "媒体地址为空");
        }
        try {
            URI uri = URI.create(mediaUrl.trim());
            HttpRequest req = HttpRequest.newBuilder(uri).GET()
                    .timeout(Duration.ofSeconds(120)).build();
            HttpResponse<byte[]> resp = HTTP.send(req, HttpResponse.BodyHandlers.ofByteArray());
            if (resp.statusCode() / 100 != 2) {
                throw new ResponseStatusException(BAD_REQUEST, "下载失败 HTTP " + resp.statusCode());
            }
            byte[] bytes = resp.body();
            if (bytes == null || bytes.length == 0) {
                throw new ResponseStatusException(BAD_REQUEST, "下载到的内容为空");
            }
            if (bytes.length > maxBytes) {
                throw new ResponseStatusException(BAD_REQUEST, "文件超过大小上限");
            }
            String mime = resp.headers().firstValue("content-type").orElse(defaultMime);
            return storeBytes(bytes, mime, fileNameFor(uri, mime));
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[ai-chat] 下载媒体落盘失败 url={}: {}", mediaUrl, e.toString());
            throw new ResponseStatusException(BAD_REQUEST, "下载失败：" + e.getMessage());
        }
    }

    /** 把 base64 图片数据落盘为附件(网关返回 b64_json 时用)。 */
    public AttachmentView storeBase64(String b64) {
        try {
            byte[] bytes = java.util.Base64.getDecoder().decode(b64.trim());
            if (bytes.length > MAX_BYTES) {
                throw new ResponseStatusException(BAD_REQUEST, "图片超过 50MB 上限");
            }
            return storeBytes(bytes, "image/png", "image.png");
        } catch (ResponseStatusException e) {
            throw e;
        } catch (RuntimeException e) {
            throw new ResponseStatusException(BAD_REQUEST, "解析 base64 图片失败：" + e.getMessage());
        }
    }

    /** 把字节落盘为附件。 */
    private AttachmentView storeBytes(byte[] bytes, String mime, String name) {
        String id = "att_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        Path dir = resolveDir(id);
        try {
            Files.createDirectories(dir);
            Files.write(dir.resolve(name), bytes);
        } catch (IOException e) {
            throw new UncheckedIOException("附件落盘失败", e);
        }
        return new AttachmentView(id, name, mime, url(id));
    }

    /** 由 URL 末段或 mime 推一个落盘文件名。 */
    private static String fileNameFor(URI uri, String mime) {
        String path = uri.getPath();
        String last = path == null ? "" : path.substring(path.lastIndexOf('/') + 1);
        last = sanitize(last);
        if (last.contains(".")) {
            return last;
        }
        String ext = mime.contains("jpeg") ? "jpg"
                : mime.contains("webp") ? "webp"
                : mime.contains("mp4") ? "mp4"
                : mime.startsWith("video") ? "mp4"
                : "png";
        return (mime.startsWith("video") ? "video." : "image.") + ext;
    }

    /** 把 attachmentId 解析为可持久化进消息的引用。 */
    public AttachmentRef resolve(String id) {
        DownloadFile f = locate(id);
        String relPath = root.relativize(f.path()).toString().replace('\\', '/');
        return new AttachmentRef(id, f.name(), f.mime(), "ai-chat/attachments/" + relPath);
    }

    public DownloadFile locate(String id) {
        Path dir = resolveDir(id);
        if (!Files.isDirectory(dir)) {
            throw new ResponseStatusException(NOT_FOUND, "附件不存在");
        }
        try (var stream = Files.list(dir)) {
            Path file = stream.filter(Files::isRegularFile).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "附件不存在"));
            String mime = probe(file);
            return new DownloadFile(file, mime, file.getFileName().toString());
        } catch (IOException e) {
            throw new UncheckedIOException("读取附件失败", e);
        }
    }

    public byte[] readBytes(AttachmentRef ref) {
        // 按 id 重新定位到实际文件，天然走 startsWith 越权防护，不直接信任持久化的 relPath。
        Path file = locate(ref.id()).path();
        try {
            return Files.readAllBytes(file);
        } catch (IOException e) {
            throw new UncheckedIOException("读取附件字节失败", e);
        }
    }

    public void deleteByRefs(List<AttachmentRef> refs) {
        if (refs == null) {
            return;
        }
        for (AttachmentRef ref : refs) {
            try {
                Path dir = resolveDir(ref.id());
                if (Files.isDirectory(dir)) {
                    try (var s = Files.walk(dir)) {
                        s.sorted((a, b) -> b.getNameCount() - a.getNameCount()).forEach(p -> {
                            try {
                                Files.deleteIfExists(p);
                            } catch (IOException ignored) {
                                // 单文件删失败不阻断整体清理
                            }
                        });
                    }
                }
            } catch (IOException e) {
                log.warn("[ai-chat] 删除附件 {} 失败: {}", ref.id(), e.toString());
            }
        }
    }

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
            return "image";
        }
        String base = Path.of(original).getFileName().toString();
        return base.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private static String url(String id) {
        return "/api/ai-chat/attachments/" + id;
    }
}
