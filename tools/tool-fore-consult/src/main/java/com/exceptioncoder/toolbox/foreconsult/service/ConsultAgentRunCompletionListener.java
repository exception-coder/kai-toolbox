package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnTraceRepository;
import com.exceptioncoder.toolbox.llm.observability.AgentRunCompletionListener;
import com.exceptioncoder.toolbox.llm.observability.AgentRunMetadata;
import org.springframework.stereotype.Component;

/** Binds the completed Node trace immediately; browser archive is no longer the sole writer. */
@Component
public class ConsultAgentRunCompletionListener implements AgentRunCompletionListener {

    private final ConsultTurnTraceRepository repository;

    public ConsultAgentRunCompletionListener(ConsultTurnTraceRepository repository) {
        this.repository = repository;
    }

    @Override
    public void completed(String runtimeSessionId, AgentRunMetadata metadata, String traceId, long completedAt) {
        Object turnId = metadata.attributes().get("consult.turn.id");
        if ("fore-consult".equals(metadata.scope()) && turnId instanceof String value) {
            repository.bindTrace(value, traceId, completedAt);
        }
    }
}
