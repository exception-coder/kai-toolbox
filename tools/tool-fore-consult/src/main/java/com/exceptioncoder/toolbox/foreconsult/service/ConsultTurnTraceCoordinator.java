package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.ArchiveRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurnTrace;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnTraceRepository;
import com.exceptioncoder.toolbox.llm.observability.AgentRunMetadata;
import com.exceptioncoder.toolbox.llm.observability.AgentSpan;
import com.exceptioncoder.toolbox.llm.observability.AgentTelemetry;
import io.opentelemetry.context.Scope;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/** Owns one server-created root trace for each active business consultation turn. */
@Component
public class ConsultTurnTraceCoordinator {

    private final AgentTelemetry telemetry;
    private final ConsultTurnTraceRepository repository;
    private final Map<String, ActiveTurn> activeTurns = new ConcurrentHashMap<>();

    public ConsultTurnTraceCoordinator(AgentTelemetry telemetry, ConsultTurnTraceRepository repository) {
        this.telemetry = telemetry;
        this.repository = repository;
    }

    public void beginInitial(String sessionId, StartSessionRequest request) {
        begin(sessionId, request.systemName(), modules(request.moduleNames()), request.role(),
                request.orchestrationVersion(), request.engine(), request.model(), "INITIAL");
    }

    public void beginFollowUp(ConsultSession session) {
        begin(session.getSessionId(), session.getSystemName(), session.getModuleNames(), session.getRole(),
                session.getOrchestrationVersion(), session.getEngine(), session.getModel(), "PENDING_CLASSIFICATION");
    }

    public AgentRunMetadata metadataFor(ConsultSession session) {
        ActiveTurn active = activeTurns.get(session.getSessionId());
        if (active == null) {
            beginFollowUp(session);
            active = activeTurns.get(session.getSessionId());
        }
        return active.metadata().withParent(active.root().traceContext());
    }

    public <T> T traceStep(String sessionId, String spanName, Supplier<T> action) {
        ActiveTurn active = activeTurns.get(sessionId);
        if (active == null) {
            return action.get();
        }
        AgentSpan child = telemetry.start(spanName,
                active.metadata().withParent(active.root().traceContext()), active.root().traceContext());
        try (Scope ignored = child.makeCurrent()) {
            T result = action.get();
            child.success("completed");
            return result;
        } catch (RuntimeException error) {
            child.fail(error.getMessage(), error);
            throw error;
        }
    }

    public void classification(String sessionId, String questionType) {
        attribute(sessionId, "consult.question.type", questionType);
    }

    public void agentCompleted(String sessionId, String traceId, long completedAt) {
        ActiveTurn active = activeTurns.get(sessionId);
        if (active == null) {
            return;
        }
        repository.bindTrace(active.turn().turnId(), traceId, completedAt);
        active.root().event("agent.completed");
    }

    public <T> T persistAndComplete(String sessionId, ArchiveRequest request, Supplier<T> action) {
        ActiveTurn active = activeTurns.get(sessionId);
        if (active == null) {
            return action.get();
        }
        String category = firstProblemCategory(request);
        if (category != null) {
            attribute(sessionId, "consult.problem.category", category);
        }
        try {
            T result = traceStep(sessionId, "consult.persist", action);
            finish(sessionId, "completed", null, false);
            return result;
        } catch (RuntimeException error) {
            finish(sessionId, "persist failed", error, false);
            throw error;
        }
    }

    public void cancel(String sessionId, String reason) {
        finish(sessionId, reason, null, true);
    }

    public void fail(String sessionId, Throwable error) {
        finish(sessionId, "dispatch failed", error, true);
    }

    private void begin(String sessionId, String system, String moduleNames, String role,
                       String orchestrationVersion, String engine, String model, String questionType) {
        ActiveTurn previous = activeTurns.remove(sessionId);
        if (previous != null) {
            previous.root().fail("overlapping consultation turn", null);
            repository.deleteReservation(previous.turn().turnId());
        }
        ConsultTurnTrace turn = repository.reserveNext(sessionId);
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("consult.turn.id", turn.turnId());
        put(attributes, "consult.system.name", system);
        put(attributes, "consult.module.names", moduleNames);
        put(attributes, "consult.module.paths", moduleNames);
        put(attributes, "consult.role", role);
        put(attributes, "consult.orchestration.version", orchestrationVersion);
        put(attributes, "consult.question.type", questionType);
        AgentRunMetadata metadata = new AgentRunMetadata(
                "fore-consult", sessionId, turn.turnIndex(), engine, model, attributes);
        AgentSpan root = telemetry.start("fore_consult.turn", metadata);
        activeTurns.put(sessionId, new ActiveTurn(turn, metadata, root));
    }

    private void attribute(String sessionId, String key, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        activeTurns.computeIfPresent(sessionId, (ignored, active) -> {
            active.root().attribute(key, value);
            Map<String, Object> attributes = new LinkedHashMap<>(active.metadata().attributes());
            attributes.put(key, value);
            AgentRunMetadata metadata = new AgentRunMetadata(
                    active.metadata().scope(), active.metadata().correlationId(), active.metadata().turnIndex(),
                    active.metadata().engine(), active.metadata().model(), attributes);
            return new ActiveTurn(active.turn(), metadata, active.root());
        });
    }

    private void finish(String sessionId, String reason, Throwable error, boolean deleteUnusedReservation) {
        ActiveTurn active = activeTurns.remove(sessionId);
        if (active == null) {
            return;
        }
        if (error == null) {
            active.root().success(reason);
        } else {
            active.root().fail(reason, error);
        }
        if (deleteUnusedReservation) {
            repository.deleteReservation(active.turn().turnId());
        }
    }

    private static String modules(java.util.List<String> modules) {
        return modules == null || modules.isEmpty() ? null : String.join(" > ", modules);
    }

    private static void put(Map<String, Object> target, String key, String value) {
        if (value != null && !value.isBlank()) {
            target.put(key, value);
        }
    }

    private static String firstProblemCategory(ArchiveRequest request) {
        if (request == null || request.turns() == null) {
            return null;
        }
        return request.turns().stream()
                .map(ArchiveRequest.TurnItem::problemCategory)
                .filter(value -> value != null && !value.isBlank())
                .findFirst()
                .orElse(null);
    }

    @PreDestroy
    void closeActiveTurns() {
        activeTurns.keySet().forEach(sessionId ->
                finish(sessionId, "application shutdown",
                        new IllegalStateException("application shutdown before consultation turn persisted"), false));
    }

    private record ActiveTurn(ConsultTurnTrace turn, AgentRunMetadata metadata, AgentSpan root) {
    }
}
