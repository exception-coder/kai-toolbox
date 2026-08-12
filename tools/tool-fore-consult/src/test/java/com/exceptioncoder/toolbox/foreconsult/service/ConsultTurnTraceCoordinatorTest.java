package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.ArchiveRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurnTrace;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnTraceRepository;
import com.exceptioncoder.toolbox.llm.observability.AgentRunMetadata;
import com.exceptioncoder.toolbox.llm.observability.AgentSpan;
import com.exceptioncoder.toolbox.llm.observability.AgentTelemetry;
import com.exceptioncoder.toolbox.llm.observability.TraceContext;
import io.opentelemetry.context.Scope;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ConsultTurnTraceCoordinatorTest {

    @Test
    void keepsDispatchAgentAndPersistUnderTheReservedTurnRoot() {
        AgentTelemetry telemetry = mock(AgentTelemetry.class);
        ConsultTurnTraceRepository repository = mock(ConsultTurnTraceRepository.class);
        AgentSpan root = mock(AgentSpan.class);
        AgentSpan child = mock(AgentSpan.class);
        Scope scope = mock(Scope.class);
        TraceContext rootContext = new TraceContext(
                "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01", null);
        ConsultTurnTrace turn = new ConsultTurnTrace("turn-1", "session-1", 1, null, 1L, null);
        when(repository.reserveNext("session-1")).thenReturn(turn);
        when(telemetry.start(eq("fore_consult.turn"), any(AgentRunMetadata.class))).thenReturn(root);
        when(root.traceContext()).thenReturn(rootContext);
        when(telemetry.start(any(String.class), any(AgentRunMetadata.class), eq(rootContext))).thenReturn(child);
        when(child.makeCurrent()).thenReturn(scope);

        ConsultTurnTraceCoordinator coordinator = new ConsultTurnTraceCoordinator(telemetry, repository);
        coordinator.beginInitial("session-1", new StartSessionRequest(
                "srm-system", "D:/srm", List.of("订单", "退货"), "260811-退货异常", "为何失败",
                "7", "IT", "codex", "gpt-5.6", "low", "default", "C:/Users/zhang/.codex", "v4"));
        assertThat(coordinator.traceStep("session-1", "consult.route", () -> "route",
                ignored -> Map.of("consult.route.summary", "证据系统：erp,srm；命中路线：1")))
                .isEqualTo("route");
        coordinator.classification("session-1", "FOLLOW_UP");

        AgentRunMetadata metadata = coordinator.metadataFor(ConsultSession.builder()
                .sessionId("session-1").systemName("srm-system").build());
        assertThat(metadata.attributes()).containsEntry("consult.turn.id", "turn-1");
        assertThat(metadata.attributes()).containsEntry("consult.question.title", "260811-退货异常");
        assertThat(metadata.attributes()).containsEntry("consult.orchestration.version", "v4");
        assertThat(metadata.attributes()).containsEntry(
                "consult.route.summary", "证据系统：erp,srm；命中路线：1");
        assertThat(metadata.attributes()).containsEntry("consult.question.type", "FOLLOW_UP");
        assertThat(metadata.parentTraceContext()).isEqualTo(rootContext);

        coordinator.agentCompleted("session-1", "0123456789abcdef0123456789abcdef", 100L);
        coordinator.persistAndComplete("session-1", new ArchiveRequest(null, "NONE", List.of()), () -> "saved");

        verify(repository).bindTrace("turn-1", "0123456789abcdef0123456789abcdef", 100L);
        verify(telemetry).start(eq("consult.route"), any(AgentRunMetadata.class), eq(rootContext));
        verify(child).attribute("consult.route.summary", "证据系统：erp,srm；命中路线：1");
        verify(telemetry).start(eq("consult.persist"), any(AgentRunMetadata.class), eq(rootContext));
        verify(root).success("completed");
    }
}
