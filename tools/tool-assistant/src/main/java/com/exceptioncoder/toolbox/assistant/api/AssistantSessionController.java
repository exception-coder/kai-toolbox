package com.exceptioncoder.toolbox.assistant.api;

import com.exceptioncoder.toolbox.assistant.domain.AssistantContextSnapshot;
import com.exceptioncoder.toolbox.assistant.service.AssistantContextService;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Assistant 会话上下文接口。 */
@RestController
@RequestMapping("/api/assistant/sessions/{sessionId}/context")
@RequireAuth
public class AssistantSessionController {

    private final AssistantContextService service;

    public AssistantSessionController(AssistantContextService service) {
        this.service = service;
    }

    /** 保存请求时上下文。 */
    @PostMapping
    public AssistantContextSnapshot save(@PathVariable String sessionId,
                                         @Valid @RequestBody SaveContextRequest request) {
        return service.save(sessionId, request.protocolVersion(), request.snapshot());
    }

    /** 读取会话最新上下文。 */
    @GetMapping
    public AssistantContextSnapshot latest(@PathVariable String sessionId) {
        return service.latest(sessionId);
    }

    /** 保存上下文请求。 */
    public record SaveContextRequest(@NotBlank @Size(max = 20) String protocolVersion, Object snapshot) {
    }
}
