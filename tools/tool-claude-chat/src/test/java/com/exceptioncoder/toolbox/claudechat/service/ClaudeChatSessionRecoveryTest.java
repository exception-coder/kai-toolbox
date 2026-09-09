package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.WebSocketSession;

import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 回归中断恢复的真实服务入口、失败保留和会话互斥。 */
class ClaudeChatSessionRecoveryTest {
    private final Map<Class<?>, Object> dependencies = new HashMap<>();
    private ClaudeChatService service;
    private Object context;
    private WebSocketSession socket;
    private SessionRuntimeStateService runtime;
    private SidecarClient sidecar;
    private ClaudeChatSessionRepository repository;
    private ClaudeChatSession stored;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() throws Exception {
        var constructor = ClaudeChatService.class.getConstructors()[0];
        Object[] arguments = java.util.Arrays.stream(constructor.getParameterTypes()).map(type -> {
            Object dependency = type == List.class ? List.of()
                    : type == ObjectMapper.class ? new ObjectMapper() : mock(type);
            dependencies.put(type, dependency);
            return dependency;
        }).toArray();
        service = (ClaudeChatService) constructor.newInstance(arguments);
        runtime = dependency(SessionRuntimeStateService.class);
        sidecar = dependency(SidecarClient.class);
        repository = dependency(ClaudeChatSessionRepository.class);
        stored = ClaudeChatSession.builder().id("session-1").cwd("D:/project")
                .status(SessionStatus.INTERRUPTED).engine("codex").sdkSessionId("native-1").build();
        when(repository.findById("session-1")).thenReturn(Optional.of(stored));
        when(sidecar.isConnected()).thenReturn(true);
        when(dependency(EngineCatalogService.class).selectable(anyString())).thenReturn(true);
        when(dependency(SessionPlanStateService.class).writable(anyString())).thenReturn(true);
        when(dependency(ClaudeChatSessionAccessPolicy.class).canAccess(any(), anyString())).thenReturn(true);
        socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn("socket-1");
        when(socket.getUri()).thenReturn(URI.create("ws://localhost/api/claude-chat/ws"));
        when(socket.isOpen()).thenReturn(true);
        var contextClass = Class.forName(ClaudeChatService.class.getName() + "$SessionCtx");
        var contextConstructor = contextClass.getDeclaredConstructor(String.class, String.class);
        contextConstructor.setAccessible(true);
        context = contextConstructor.newInstance("session-1", "D:/project");
        ReflectionTestUtils.setField(context, "status", SessionStatus.INTERRUPTED);
        ReflectionTestUtils.setField(context, "sdkSessionId", "native-1");
        ReflectionTestUtils.setField(context, "engine", "codex");
        ((Map<String, Object>) ReflectionTestUtils.getField(service, "sessions")).put("session-1", context);
        ((Map<String, String>) ReflectionTestUtils.getField(service, "wsToSession")).put("socket-1", "session-1");
    }

    @Test
    void shouldRestoreInterruptedStateBeforeTheSendGate() {
        allowRecovery();
        when(runtime.canStartTurn("session-1")).thenAnswer(invocation -> {
            assertThat(ReflectionTestUtils.getField(context, "status")).isEqualTo(SessionStatus.IDLE);
            return new SessionRuntimeStateService.SendDecision(false, "TEST_STOP", "stop before dispatch");
        });
        service.sendUserMessage(socket, new ClientMessage.Send("continue", null, null, null, "message-1"));
        verify(repository).touch(eq("session-1"), eq(SessionStatus.IDLE), anyLong());
        verify(runtime).canStartTurn("session-1");
        assertThat(ReflectionTestUtils.getField(context, "sdkSessionId")).isEqualTo("native-1");
    }

    @Test
    void shouldLeaveInterruptedStateWhenReloadIsUnconfirmed() {
        when(runtime.canReload("session-1")).thenReturn(
                new SessionRuntimeStateService.SendDecision(true, "RECOVERABLE_INTERRUPTED", "ready"),
                new SessionRuntimeStateService.SendDecision(false, "SIDECAR_UNREACHABLE", "timeout"));
        service.resumeCurrent(socket, new ClientMessage.ResumeCurrent("session-1"));
        assertThat(ReflectionTestUtils.getField(context, "status")).isEqualTo(SessionStatus.INTERRUPTED);
        verify(repository, never()).touch(anyString(), any(), anyLong());
    }

    @Test
    void shouldRestoreOnlyAfterReloadConfirmation() {
        allowRecovery();
        service.resumeCurrent(socket, new ClientMessage.ResumeCurrent("session-1"));
        verify(runtime, times(2)).canReload("session-1");
        assertThat(ReflectionTestUtils.getField(context, "status")).isEqualTo(SessionStatus.IDLE);
        verify(repository).touch(eq("session-1"), eq(SessionStatus.IDLE), anyLong());
    }

    @Test
    void shouldRejectActiveReloadWithoutEndingTheTurn() throws Exception {
        ReflectionTestUtils.setField(context, "status", SessionStatus.RUNNING);
        when(runtime.canReload("session-1")).thenReturn(
                new SessionRuntimeStateService.SendDecision(false, "CONSISTENT", "running"));
        service.resumeCurrent(socket, new ClientMessage.ResumeCurrent("session-1"));
        assertThat(service.isRunning("session-1")).isTrue();
        verify(repository, never()).touch(anyString(), any(), anyLong());
        verifyNoInteractions(sidecar);
        verify(socket).sendMessage(argThat(message -> message.getPayload().toString().contains("\"terminal\":false")));
    }

    @Test
    void shouldSerializeReloadAgainstTheSessionLock() throws Exception {
        var attempted = new CountDownLatch(1);
        when(runtime.canReload("session-1")).thenReturn(
                new SessionRuntimeStateService.SendDecision(false, "CONSISTENT", "running"));
        try (var executor = Executors.newSingleThreadExecutor()) {
            java.util.concurrent.Future<?> reload;
            synchronized (context) {
                reload = executor.submit(() -> {
                    attempted.countDown();
                    service.resumeCurrent(socket, new ClientMessage.ResumeCurrent("session-1"));
                });
                assertThat(attempted.await(2, TimeUnit.SECONDS)).isTrue();
                ReflectionTestUtils.setField(context, "status", SessionStatus.RUNNING);
                verify(runtime, after(100).never()).canReload(anyString());
            }
            reload.get(3, TimeUnit.SECONDS);
        }
        assertThat(service.isRunning("session-1")).isTrue();
        verifyNoInteractions(sidecar);
    }

    @Test
    void shouldNotNormalizeMissingSidecarSessionDuringSend() {
        when(runtime.canReload("session-1")).thenReturn(
                new SessionRuntimeStateService.SendDecision(true, "RESTORABLE_SESSION_MISSING", "reload required"));
        when(runtime.canStartTurn("session-1")).thenReturn(
                new SessionRuntimeStateService.SendDecision(false, "RESTORABLE_SESSION_MISSING", "reload required"));
        service.sendUserMessage(socket, new ClientMessage.Send("continue", null, null, null, "message-1"));
        assertThat(ReflectionTestUtils.getField(context, "status")).isEqualTo(SessionStatus.INTERRUPTED);
        verify(repository, never()).touch(anyString(), any(), anyLong());
    }

    @Test
    void shouldNotClaimReloadCompletedWhileSidecarSessionIsStillMissing() {
        when(runtime.canReload("session-1")).thenReturn(
                new SessionRuntimeStateService.SendDecision(true, "RESTORABLE_SESSION_MISSING", "reload required"));
        service.resumeCurrent(socket, new ClientMessage.ResumeCurrent("session-1"));
        assertThat(ReflectionTestUtils.getField(context, "status")).isEqualTo(SessionStatus.INTERRUPTED);
        verify(repository, never()).touch(anyString(), any(), anyLong());
    }

    private void allowRecovery() {
        when(runtime.canReload("session-1")).thenReturn(
                new SessionRuntimeStateService.SendDecision(true, "RECOVERABLE_INTERRUPTED", "ready"));
    }

    private <T> T dependency(Class<T> type) {
        return type.cast(dependencies.get(type));
    }
}
