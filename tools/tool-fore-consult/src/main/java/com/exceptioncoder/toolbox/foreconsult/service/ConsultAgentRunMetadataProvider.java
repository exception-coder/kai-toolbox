package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.llm.observability.AgentRunMetadata;
import com.exceptioncoder.toolbox.llm.observability.AgentRunMetadataProvider;
import org.springframework.stereotype.Component;

import java.util.Optional;

/** 把业务咨询会话快照投影为通用 Agent Trace 的受控元数据。 */
@Component
public class ConsultAgentRunMetadataProvider implements AgentRunMetadataProvider {

    private final ConsultSessionRepository sessionRepository;
    private final ConsultTurnTraceCoordinator traceCoordinator;

    public ConsultAgentRunMetadataProvider(ConsultSessionRepository sessionRepository,
                                           ConsultTurnTraceCoordinator traceCoordinator) {
        this.sessionRepository = sessionRepository;
        this.traceCoordinator = traceCoordinator;
    }

    @Override
    public Optional<AgentRunMetadata> resolve(String runtimeSessionId) {
        return sessionRepository.findByDevSessionId(runtimeSessionId).map(traceCoordinator::metadataFor);
    }
}
