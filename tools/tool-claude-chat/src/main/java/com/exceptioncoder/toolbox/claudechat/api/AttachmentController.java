package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.AttachmentView;
import com.exceptioncoder.toolbox.claudechat.service.AttachmentStorageService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

/**
 * 附件上传：multipart 上传单个文件，落盘到会话 cwd 专用目录后返回句柄。契约见 api 文档 §2。
 */
@RestController
@RequestMapping("/api/claude-chat/sessions/{sessionId}/attachments")
public class AttachmentController {

    private final AttachmentStorageService storage;

    public AttachmentController(AttachmentStorageService storage) {
        this.storage = storage;
    }

    @PostMapping
    public AttachmentView upload(@PathVariable String sessionId,
                                 @RequestPart("file") MultipartFile file) throws IOException {
        return storage.store(sessionId, file);
    }
}
