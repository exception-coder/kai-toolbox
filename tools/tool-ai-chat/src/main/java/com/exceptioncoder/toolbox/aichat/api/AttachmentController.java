package com.exceptioncoder.toolbox.aichat.api;

import com.exceptioncoder.toolbox.aichat.api.dto.AttachmentView;
import com.exceptioncoder.toolbox.aichat.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.aichat.service.AttachmentStorageService.DownloadFile;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/ai-chat/attachments")
public class AttachmentController {

    private final AttachmentStorageService service;

    public AttachmentController(AttachmentStorageService service) {
        this.service = service;
    }

    @PostMapping
    public AttachmentView upload(@RequestParam("file") MultipartFile file) {
        return service.store(file);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Resource> download(@PathVariable String id) {
        DownloadFile f = service.locate(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(f.mime()))
                .body(new FileSystemResource(f.path()));
    }
}
