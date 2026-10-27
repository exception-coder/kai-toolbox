package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SessionLocalPathAccessService;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** 将会话可访问项目中的本地图片转为有界、鉴权的浏览器响应，不开放任意磁盘文件。 */
@RestController
public class SessionImageController {
    private static final int MAX_IMAGE_BYTES = 25 * 1024 * 1024;
    private final ClaudeChatSessionRepository repository;
    private final ClaudeChatSessionAccessPolicy access;
    private final SessionLocalPathAccessService paths;

    public SessionImageController(ClaudeChatSessionRepository repository, ClaudeChatSessionAccessPolicy access,
                                  SessionLocalPathAccessService paths) {
        this.repository = repository;
        this.access = access;
        this.paths = paths;
    }

    @RequireAuth
    @GetMapping("/api/claude-chat/sessions/{id}/image")
    public ResponseEntity<byte[]> image(@PathVariable String id, @RequestParam String path) throws IOException {
        if (!access.canAccessCurrentUser(id)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前用户不能访问该会话图片");
        }
        var session = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "会话不存在"));
        if (session.getCwd() == null || session.getCwd().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "会话没有工作目录");
        }
        Path file = paths.resolve(id, Path.of(session.getCwd()).toAbsolutePath().normalize(),
                SessionFileController.normalizeLinkedPath(path));
        if (!Files.isRegularFile(file) || !Files.isReadable(file)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "图片文件不存在或不可读");
        }
        if (Files.size(file) > MAX_IMAGE_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "图片超过 25 MiB，请压缩后查看");
        }
        byte[] bytes;
        try (var input = Files.newInputStream(file)) { bytes = input.readNBytes(MAX_IMAGE_BYTES + 1); }
        if (bytes.length > MAX_IMAGE_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "图片超过 25 MiB，请压缩后查看");
        }
        String mime = imageMime(bytes);
        if (mime == null) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "文件不是受支持的 PNG、JPEG、GIF、WebP、BMP 或 AVIF 图片");
        }
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(mime))
                .cacheControl(CacheControl.noStore()).header("X-Content-Type-Options", "nosniff").body(bytes);
    }

    private static String imageMime(byte[] bytes) {
        if (bytes.length < 12) return null;
        if ((bytes[0] & 255) == 137 && "PNG\r\n\u001a\n".equals(new String(bytes, 1, 7, StandardCharsets.ISO_8859_1))) return "image/png";
        if ((bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255) return "image/jpeg";
        String start = new String(bytes, 0, 12, StandardCharsets.ISO_8859_1);
        if (start.startsWith("GIF87a") || start.startsWith("GIF89a")) return "image/gif";
        if (start.startsWith("RIFF") && start.endsWith("WEBP")) return "image/webp";
        if (start.startsWith("BM")) return "image/bmp";
        if (start.substring(4).equals("ftypavif") || start.substring(4).equals("ftypavis")) return "image/avif";
        return null;
    }
}
