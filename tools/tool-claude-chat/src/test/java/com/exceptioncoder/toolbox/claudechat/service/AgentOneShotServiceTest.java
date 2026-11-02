package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.llm.observability.AgentTelemetry;
import com.exceptioncoder.toolbox.llm.observability.AgentRunMetadata;
import com.exceptioncoder.toolbox.llm.observability.TraceContext;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner.ExecutionRequest;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class AgentOneShotServiceTest {

    @Test
    void managedImagesReachExistingSidecarWithoutChangingCancellationOrDisabledTools() throws Exception {
        var sidecar = mock(SidecarClient.class);
        var catalog = mock(CodexModelCatalogService.class);
        org.mockito.Mockito.when(catalog.supportsImages("account", "vision")).thenReturn(true);
        var service = new AgentOneShotService(mock(SidecarProcessRegistry.class), sidecar,
                new ClaudeChatProperties(), AgentTelemetry.noop(256), new AgentWorkAdmissionGate(), catalog);
        var request = new ExecutionRequest("system", "question", null, "vision", "codex", null, null, null, null, "account", "disabled");
        var images = java.util.List.of(new com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner.ImageInput("b3JpZ2luYWw=", "image/png"));
        var sent = new CountDownLatch(1);
        var runtimeId = new java.util.concurrent.atomic.AtomicReference<String>();
        doAnswer(call -> {
            assertThat((java.util.List<?>) call.getArgument(3)).isEqualTo(images);
            assertThat((ExecutionRequest) call.getArgument(1)).isEqualTo(request);
            runtimeId.set(call.getArgument(0)); sent.countDown(); return null;
        }).when(sidecar).oneShot(anyString(), any(ExecutionRequest.class), anyString(), org.mockito.ArgumentMatchers.anyList(), any(TraceContext.class), any(AgentRunMetadata.class));
        var result = new java.util.concurrent.FutureTask<>(() -> service.runManaged(request, java.util.UUID.randomUUID().toString(), images));
        Thread.ofVirtual().start(result);
        assertThat(sent.await(3, TimeUnit.SECONDS)).isTrue();
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        service.handle(runtimeId.get(), mapper.readTree("{\"type\":\"assistantDelta\",\"text\":\"observed image\"}"));
        service.handle(runtimeId.get(), mapper.readTree("{\"type\":\"result\",\"stopReason\":\"end_turn\"}"));
        assertThat(result.get(3, TimeUnit.SECONDS)).isEqualTo("observed image");
        org.mockito.Mockito.when(catalog.supportsImages("account", "vision")).thenReturn(false);
        assertThatThrownBy(() -> service.runManaged(request, java.util.UUID.randomUUID().toString(), images)).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void managedCancellationWaitsForTerminalAcknowledgementAndRejectsInterruptedText() throws Exception {
        var sidecar = mock(SidecarClient.class);
        var service = new AgentOneShotService(mock(SidecarProcessRegistry.class), sidecar,
                new ClaudeChatProperties(), AgentTelemetry.noop(256), new AgentWorkAdmissionGate(), mock(CodexModelCatalogService.class));
        var sent = new CountDownLatch(1);
        var runtimeId = new java.util.concurrent.atomic.AtomicReference<String>();
        doAnswer(call -> { runtimeId.set(call.getArgument(0)); sent.countDown(); return null; })
                .when(sidecar).oneShot(anyString(), any(ExecutionRequest.class), anyString(), isNull(), any(TraceContext.class), any(AgentRunMetadata.class));
        org.mockito.Mockito.when(sidecar.interrupt(anyString())).thenReturn(true);
        String id = java.util.UUID.randomUUID().toString();
        var result = new java.util.concurrent.FutureTask<>(() -> service.runManaged(ExecutionRequest.text("system", "data", null, "codex"), id));
        Thread worker = Thread.ofVirtual().start(result);
        assertThat(sent.await(2, TimeUnit.SECONDS)).isTrue();
        assertThat(service.cancelManaged(id)).isTrue();
        assertThat(result.isDone()).isFalse();
        assertThat(service.activeCount()).isEqualTo(1);
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        service.handle(runtimeId.get(), mapper.readTree("{\"type\":\"assistantDelta\",\"text\":\"partial\"}"));
        service.handle(runtimeId.get(), mapper.readTree("{\"type\":\"result\",\"stopReason\":\"interrupted\"}"));
        assertThatThrownBy(() -> result.get(2, TimeUnit.SECONDS)).isInstanceOf(java.util.concurrent.ExecutionException.class);
        worker.join(1000);
        assertThat(service.activeCount()).isZero();
    }

    @Test
    void managedOversizeAndErrorEventsDoNotReturnSuccessBeforeEngineTerminal() throws Exception {
        var sidecar = mock(SidecarClient.class);
        var service = new AgentOneShotService(mock(SidecarProcessRegistry.class), sidecar,
                new ClaudeChatProperties(), AgentTelemetry.noop(256), new AgentWorkAdmissionGate(), mock(CodexModelCatalogService.class));
        var sent = new CountDownLatch(1);
        var runtimeId = new java.util.concurrent.atomic.AtomicReference<String>();
        doAnswer(call -> { runtimeId.set(call.getArgument(0)); sent.countDown(); return null; })
                .when(sidecar).oneShot(anyString(), any(ExecutionRequest.class), anyString(), isNull(), any(TraceContext.class), any(AgentRunMetadata.class));
        var result = new java.util.concurrent.FutureTask<>(() -> service.runManaged(ExecutionRequest.text("system", "data", null, "codex"), java.util.UUID.randomUUID().toString()));
        Thread worker = Thread.ofVirtual().start(result);
        assertThat(sent.await(2, TimeUnit.SECONDS)).isTrue();
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var event = mapper.createObjectNode().put("type", "assistantDelta").put("text", "x".repeat(48001));
        service.handle(runtimeId.get(), event);
        org.mockito.Mockito.verify(sidecar).interrupt(runtimeId.get());
        service.handle(runtimeId.get(), mapper.createObjectNode().put("type", "error").put("message", "failure"));
        assertThat(result.isDone()).isFalse();
        service.handle(runtimeId.get(), mapper.readTree("{\"type\":\"result\",\"stopReason\":\"end_turn\"}"));
        assertThatThrownBy(() -> result.get(2, TimeUnit.SECONDS)).isInstanceOf(java.util.concurrent.ExecutionException.class);
        worker.join(1000);
        assertThat(service.activeCount()).isZero();
    }

    @Test
    void drainRejectsOneShotBeforeStartingOrRegisteringWork() {
        SidecarProcessRegistry processRegistry = mock(SidecarProcessRegistry.class);
        SidecarClient sidecar = mock(SidecarClient.class);
        AgentWorkAdmissionGate gate = new AgentWorkAdmissionGate();
        AgentOneShotService service = new AgentOneShotService(
                processRegistry, sidecar, new ClaudeChatProperties(), AgentTelemetry.noop(256), gate, mock(CodexModelCatalogService.class));

        try (AgentWorkAdmissionGate.DrainLease ignored = gate.tryAcquireDrain().orElseThrow()) {
            assertThatThrownBy(() -> service.runOnce("system", "user", null, "codex"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("自动更新");
        }

        assertThat(service.activeCount()).isZero();
        verifyNoInteractions(processRegistry, sidecar);
    }

    @Test
    void cancellationSendsInterruptBeforeRestoringThreadInterruptFlag() throws Exception {
        SidecarProcessRegistry processRegistry = mock(SidecarProcessRegistry.class);
        SidecarClient sidecar = mock(SidecarClient.class);
        ClaudeChatProperties properties = new ClaudeChatProperties();
        AgentOneShotService service = new AgentOneShotService(
                processRegistry, sidecar, properties, AgentTelemetry.noop(256),
                new AgentWorkAdmissionGate(), mock(CodexModelCatalogService.class));
        CountDownLatch requestSent = new CountDownLatch(1);
        AtomicBoolean interruptedDuringSidecarSend = new AtomicBoolean(true);

        doAnswer(invocation -> {
            requestSent.countDown();
            return null;
        }).when(sidecar).oneShot(anyString(), any(ExecutionRequest.class), anyString(), isNull(),
                any(TraceContext.class), any(AgentRunMetadata.class));
        doAnswer(invocation -> {
            interruptedDuringSidecarSend.set(Thread.currentThread().isInterrupted());
            return true;
        }).when(sidecar).interrupt(anyString());

        AtomicBoolean interruptedAfterCancellation = new AtomicBoolean(false);
        Thread worker = Thread.ofVirtual().start(() -> {
            try {
                service.runOnce("system", "user", null, "codex");
            } catch (RuntimeException ignored) {
                interruptedAfterCancellation.set(Thread.currentThread().isInterrupted());
            }
        });

        assertThat(requestSent.await(1, TimeUnit.SECONDS)).isTrue();
        assertThat(service.activeCount()).isEqualTo(1);
        worker.interrupt();
        worker.join(1_000);

        assertThat(interruptedDuringSidecarSend.get()).isFalse();
        assertThat(interruptedAfterCancellation.get()).isTrue();
        assertThat(service.activeCount()).isZero();
    }
}
