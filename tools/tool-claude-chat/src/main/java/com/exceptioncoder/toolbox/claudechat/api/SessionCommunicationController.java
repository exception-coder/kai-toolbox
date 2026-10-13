package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.communication.CommunicationRecord.*;
import com.exceptioncoder.toolbox.claudechat.api.dto.AttachmentView;
import com.exceptioncoder.toolbox.claudechat.service.communication.SessionCommunicationService;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import org.springframework.core.io.PathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

import java.util.List;

/** 与现有开发会话同一权限边界的沟通材料 API。 */
@RequireAuth
@RestController("claudeChatSessionCommunicationController")
@RequestMapping("/api/claude-chat/sessions/{sessionId}/communications")
public class SessionCommunicationController {
    private final SessionCommunicationService service;

    public SessionCommunicationController(SessionCommunicationService service) { this.service = service; }

    @GetMapping
    public Page list(@PathVariable String sessionId, @RequestParam(defaultValue = "") String q,
                     @RequestParam(defaultValue = "desc") String order, @RequestParam(defaultValue = "all") String notes,
                     @RequestParam(defaultValue = "false") boolean removed, @RequestParam(defaultValue = "0") int page) {
        return service.list(sessionId, new Filter(q, order, notes, removed, page));
    }

    @GetMapping("/{id}")
    public Detail detail(@PathVariable String sessionId, @PathVariable String id) { return service.detail(sessionId, id); }

    @PutMapping("/{id}")
    public Detail save(@PathVariable String sessionId, @PathVariable String id, @RequestBody Input input) {
        return service.save(sessionId, id, input);
    }

    @PostMapping("/{id}/removed")
    public Detail remove(@PathVariable String sessionId, @PathVariable String id, @RequestBody Removal input) {
        return service.setRemoved(sessionId, id, input.expectedVersion(), input.removed());
    }

    @PostMapping("/reference")
    public Reference reference(@PathVariable String sessionId, @RequestBody Selection input) {
        return service.reference(sessionId, input.recordIds());
    }

    @PostMapping("/attachments")
    public AttachmentView upload(@PathVariable String sessionId, @RequestPart("file") MultipartFile file) throws IOException {
        return service.uploadImage(sessionId, file);
    }

    @GetMapping("/{id}/attachments/{attachmentId}")
    public ResponseEntity<Resource> image(@PathVariable String sessionId, @PathVariable String id,
                                          @PathVariable String attachmentId) {
        var image = service.image(sessionId, id, attachmentId);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.mime()))
                .cacheControl(CacheControl.noStore()).header("X-Content-Type-Options", "nosniff")
                .body(new PathResource(image.file()));
    }

    public record Removal(int expectedVersion, boolean removed) { }
    public record Selection(List<String> recordIds) { }
}
