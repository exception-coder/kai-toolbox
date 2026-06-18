package com.exceptioncoder.toolbox.aichat.api;

import com.exceptioncoder.toolbox.aichat.api.dto.SendMessageRequest;
import com.exceptioncoder.toolbox.aichat.service.AiChatService;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

@RestController
@RequestMapping("/api/ai-chat/completions")
public class CompletionController {

    private final AiChatService service;
    private final SseEmitterRegistry sse;

    public CompletionController(AiChatService service, SseEmitterRegistry sse) {
        this.service = service;
        this.sse = sse;
    }

    @PostMapping
    public Map<String, String> send(@RequestBody SendMessageRequest req) {
        return Map.of("taskId", service.send(req));
    }

    @GetMapping(value = "/{taskId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(@PathVariable String taskId) {
        SseEmitter emitter = sse.create(taskId);
        try {
            service.openStream(taskId);
        } catch (RuntimeException e) {
            sse.complete(taskId);
            throw e;
        }
        return emitter;
    }

    @PostMapping("/{taskId}/stop")
    public Map<String, Object> stop(@PathVariable String taskId) {
        return Map.of("stopped", service.stop(taskId));
    }
}
