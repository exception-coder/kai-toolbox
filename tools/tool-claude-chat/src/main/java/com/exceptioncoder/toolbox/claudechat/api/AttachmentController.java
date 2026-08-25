package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.AttachmentView;
import com.exceptioncoder.toolbox.claudechat.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import org.springframework.core.io.PathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 附件上传 + 静态文件服务。
 * - POST /api/claude-chat/sessions/{sessionId}/attachments  上传附件落盘
 * - GET  /api/claude-chat/attachments/file?path=...         按绝对路径读取并返回（安全：路径必须含 .kai-chat-attachments）
 */
@RestController("claudeChatAttachmentController")
public class AttachmentController {

    private static final String ATTACH_DIR_MARKER = ".kai-chat-attachments";

    private final AttachmentStorageService storage;
    private final ClaudeChatSessionAccessPolicy sessionAccessPolicy;

    public AttachmentController(AttachmentStorageService storage,
                                ClaudeChatSessionAccessPolicy sessionAccessPolicy) {
        this.storage = storage;
        this.sessionAccessPolicy = sessionAccessPolicy;
    }

    @RequireAuth
    @PostMapping("/api/claude-chat/sessions/{sessionId}/attachments")
    public AttachmentView upload(@PathVariable String sessionId,
                                 @RequestPart("file") MultipartFile file) throws IOException {
        if (!sessionAccessPolicy.canAccessOrClaimCurrentUser(sessionId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前用户不能访问该会话");
        }
        return storage.store(sessionId, file);
    }

    /**
     * 按绝对路径提供附件文件（用于历史消息的图片展示）。
     * 安全约束：路径必须包含 {@code .kai-chat-attachments} 目录段，拒绝任意文件读取。
     */
    @GetMapping("/api/claude-chat/attachments/file")
    public ResponseEntity<Resource> serveFile(@RequestParam String path) throws IOException {
        // 安全校验：只允许访问 .kai-chat-attachments 目录内的文件
        if (path == null || !path.contains(ATTACH_DIR_MARKER)) {
            return ResponseEntity.status(403).build();
        }
        Path file;
        try {
            file = Path.of(path).normalize();
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
        // 二次验证规范化后的路径仍包含标记目录
        if (!file.toString().contains(ATTACH_DIR_MARKER)) {
            return ResponseEntity.status(403).build();
        }
        if (!Files.isRegularFile(file) || !Files.isReadable(file)) {
            return ResponseEntity.notFound().build();
        }
        String mime = Files.probeContentType(file);
        if (mime == null) mime = "application/octet-stream";
        Resource resource = new PathResource(file);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mime))
                .body(resource);
    }
}
