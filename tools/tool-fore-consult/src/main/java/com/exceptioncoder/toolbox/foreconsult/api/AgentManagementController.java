package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.exceptioncoder.toolbox.foreconsult.api.dto.CreateAgentVersionRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.AgentManagementSnapshot;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultAgentManagementService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 业务咨询 Agent 的 Registry、配置版本和发布端点。
 */
@RestController
@RequireRole("ADMIN")
@RequestMapping("/api/fore-consult/agents")
public class AgentManagementController {

    private final ConsultAgentManagementService service;

    public AgentManagementController(ConsultAgentManagementService service) {
        this.service = service;
    }

    @GetMapping
    public java.util.List<com.exceptioncoder.toolbox.foreconsult.repository.ConsultAgentManagementRepository.AgentDefinition> list() {
        return service.listAgents();
    }

    @GetMapping("/{agentId}")
    public AgentManagementSnapshot get(@PathVariable String agentId) {
        return service.getSnapshot(agentId);
    }

    @PostMapping("/{agentId}/versions")
    public AgentManagementSnapshot createCandidate(@PathVariable String agentId,
                                                    @RequestBody CreateAgentVersionRequest request) {
        return service.createCandidate(agentId, request.toCommand());
    }

    @PostMapping("/{agentId}/versions/{version}/release")
    public AgentManagementSnapshot release(@PathVariable String agentId, @PathVariable long version) {
        return service.release(agentId, version);
    }

    @PostMapping("/{agentId}/versions/{version}/rollback")
    public AgentManagementSnapshot rollback(@PathVariable String agentId, @PathVariable long version) {
        return service.rollback(agentId, version);
    }
}
