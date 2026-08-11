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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;

class AgentOneShotServiceTest {

    @Test
    void cancellationSendsInterruptBeforeRestoringThreadInterruptFlag() throws Exception {
        SidecarProcessRegistry processRegistry = mock(SidecarProcessRegistry.class);
        SidecarClient sidecar = mock(SidecarClient.class);
        ClaudeChatProperties properties = new ClaudeChatProperties();
        AgentOneShotService service = new AgentOneShotService(
                processRegistry, sidecar, properties, AgentTelemetry.noop(256));
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
        worker.interrupt();
        worker.join(1_000);

        assertThat(interruptedDuringSidecarSend.get()).isFalse();
        assertThat(interruptedAfterCancellation.get()).isTrue();
    }
}
