package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.QueuedChatMessage;
import com.exceptioncoder.toolbox.claudechat.service.QueuedChatMessageService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Vibe Coding 会话待发送消息队列。 */
@RestController
@RequestMapping("/api/claude-chat/sessions/{sessionId}/queue")
public class QueuedChatMessageController {

    private final QueuedChatMessageService service;

    public QueuedChatMessageController(QueuedChatMessageService service) {
        this.service = service;
    }

    @GetMapping
    public List<QueuedChatMessage> list(@PathVariable String sessionId) {
        return service.list(sessionId);
    }

    @PostMapping
    public QueuedChatMessage save(@PathVariable String sessionId, @RequestBody SaveRequest request) {
        return service.save(sessionId, request.id(), request.text(), request.displayText(),
                request.developerInstructions(), request.attachments(), request.createdAt());
    }

    @DeleteMapping("/{messageId}")
    public ResponseEntity<Void> delete(@PathVariable String sessionId, @PathVariable String messageId) {
        service.delete(sessionId, messageId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    public ResponseEntity<Void> clear(@PathVariable String sessionId) {
        service.clear(sessionId);
        return ResponseEntity.noContent().build();
    }

    public record SaveRequest(String id, String text, String displayText, String developerInstructions,
                              List<QueuedChatMessage.Attachment> attachments, Long createdAt) {
    }
}
