package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.AssistantIntegrationStatusView;
import com.exceptioncoder.toolbox.claudechat.service.AssistantIntegrationStatusService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 提供嵌入式业务助手接入配置的只读诊断视图。 */
@RestController
@RequestMapping("/api/claude-chat/assistant-integration")
public class AssistantIntegrationController {

    private final AssistantIntegrationStatusService service;

    public AssistantIntegrationController(AssistantIntegrationStatusService service) {
        this.service = service;
    }

    /** 返回当前生效配置，敏感认证材料不进入响应。 */
    @GetMapping
    public AssistantIntegrationStatusView current() {
        return service.current();
    }
}
