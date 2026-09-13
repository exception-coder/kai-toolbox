package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.ConsultWorkflow;
import com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultWorkflowService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 管理端复用服务端默认节点，避免前后端各维护一套规则。 */
@RestController
@RequireRole("ADMIN")
@RequestMapping("/api/fore-consult/agents/business-consult/workflow-defaults")
public class ConsultWorkflowController {
    private final ConsultWorkflowService service;

    public ConsultWorkflowController(ConsultWorkflowService service) {
        this.service = service;
    }

    @GetMapping
    public ConsultWorkflow defaults() {
        return service.defaults();
    }
}
