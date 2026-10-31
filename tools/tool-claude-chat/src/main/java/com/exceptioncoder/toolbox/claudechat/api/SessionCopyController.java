package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.SessionConfigurationCopyService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 登录态配置复制入口；公开评审 token 不构成本接口的写授权。 */
@RestController
@RequestMapping("/api/claude-chat/sessions")
public class SessionCopyController {
    private final SessionConfigurationCopyService service;

    public SessionCopyController(SessionConfigurationCopyService service) {
        this.service = service;
    }

    public record Request(String requestId) {}

    @PostMapping("/{sourceId}/copy")
    public SessionConfigurationCopyService.Result copy(@PathVariable String sourceId, @RequestBody Request request) {
        return service.copy(sourceId, request.requestId());
    }
}
