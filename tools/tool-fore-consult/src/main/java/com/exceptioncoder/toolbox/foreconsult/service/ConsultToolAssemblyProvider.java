package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultWorkflowRepository;
import com.exceptioncoder.toolbox.llm.spi.AgentToolAssemblyProvider;
import org.springframework.stereotype.Component;

import java.util.Optional;

/** 仅从服务端冻结的咨询快照装配能力，不接受客户端工具清单。 */
@Component
public class ConsultToolAssemblyProvider implements AgentToolAssemblyProvider {
    private final com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultWorkflowService workflowService;
    private final ConsultSessionRepository sessions;
    private final ConsultWorkflowRepository workflows;

    public ConsultToolAssemblyProvider(ConsultSessionRepository sessions, ConsultWorkflowRepository workflows,
                                       com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultWorkflowService workflowService) {
        this.workflowService = workflowService;
        this.sessions = sessions;
        this.workflows = workflows;
    }

    @Override
    public Optional<Assembly> resolve(String runtimeSessionId) {
        return sessions.findByDevSessionId(runtimeSessionId)
                .flatMap(session -> workflows.session(session.getSessionId()).map(snapshot -> {
                    var request = new com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultOrchestrationRequest(
                            "以本轮用户消息为准", session.getSystemName(), session.getSystemSourcePath(),
                            session.getModuleNames() == null ? java.util.List.of() : java.util.List.of(session.getModuleNames()),
                            session.getRole(), true, session.getEvidenceRouteSnapshot());
                    return new Assembly(snapshot.workflow().tools(), snapshot.workflow().mcpServers(),
                            workflowService.render(request, snapshot).prompt());
                }));
    }
}
