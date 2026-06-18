package com.exceptioncoder.toolbox.aichat.api;

import com.exceptioncoder.toolbox.aichat.api.dto.ConversationView;
import com.exceptioncoder.toolbox.aichat.api.dto.CreateConversationRequest;
import com.exceptioncoder.toolbox.aichat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.aichat.api.dto.UpdateConversationRequest;
import com.exceptioncoder.toolbox.aichat.service.ConversationService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai-chat/conversations")
public class ConversationController {

    private final ConversationService service;

    public ConversationController(ConversationService service) {
        this.service = service;
    }

    @GetMapping
    public List<ConversationView> list() {
        return service.list();
    }

    @PostMapping
    public ConversationView create(@RequestBody CreateConversationRequest req) {
        return service.create(req);
    }

    @GetMapping("/{id}")
    public ConversationView get(@PathVariable String id) {
        return service.getView(id);
    }

    @PatchMapping("/{id}")
    public ConversationView update(@PathVariable String id, @RequestBody UpdateConversationRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id) {
        service.delete(id);
        return Map.of("deleted", true);
    }

    @GetMapping("/{id}/messages")
    public MessagePage messages(@PathVariable String id,
                                @RequestParam(required = false) String before,
                                @RequestParam(required = false) Integer limit) {
        return service.messages(id, before, limit);
    }
}
