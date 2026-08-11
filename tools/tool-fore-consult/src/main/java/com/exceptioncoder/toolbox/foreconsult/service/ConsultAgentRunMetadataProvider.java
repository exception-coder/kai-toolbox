package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnRepository;
import com.exceptioncoder.toolbox.llm.observability.AgentRunMetadata;
import com.exceptioncoder.toolbox.llm.observability.AgentRunMetadataProvider;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** 把业务咨询会话快照投影为通用 Agent Trace 的受控元数据。 */
@Component
public class ConsultAgentRunMetadataProvider implements AgentRunMetadataProvider {

    private final ConsultSessionRepository sessionRepository;
    private final ConsultTurnRepository turnRepository;

    public ConsultAgentRunMetadataProvider(ConsultSessionRepository sessionRepository,
                                           ConsultTurnRepository turnRepository) {
        this.sessionRepository = sessionRepository;
        this.turnRepository = turnRepository;
    }

    @Override
    public Optional<AgentRunMetadata> resolve(String runtimeSessionId) {
        return sessionRepository.findByDevSessionId(runtimeSessionId).map(this::toMetadata);
    }

    private AgentRunMetadata toMetadata(ConsultSession session) {
        Map<String, Object> attributes = new LinkedHashMap<>();
        put(attributes, "consult.system.name", session.getSystemName());
        put(attributes, "consult.module.names", session.getModuleNames());
        put(attributes, "consult.role", session.getRole());
        put(attributes, "consult.orchestration.version", session.getOrchestrationVersion());
        return new AgentRunMetadata(
                "fore-consult",
                session.getSessionId(),
                turnRepository.countBySession(session.getSessionId()) + 1,
                session.getEngine(),
                session.getModel(),
                attributes);
    }

    private static void put(Map<String, Object> target, String key, String value) {
        if (value != null && !value.isBlank()) {
            target.put(key, value);
        }
    }
}
