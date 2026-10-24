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

    @Test
    void shouldKeepTheLiveSidecarTurnDuringConnectionRecovery() {
        ReflectionTestUtils.setField(context, "status", SessionStatus.RUNNING);
        var turns = (TurnLifecycleCoordinator) ReflectionTestUtils.getField(service, "turnLifecycle");
        turns.adopt("session-1", "live-turn");
        when(sidecar.querySessionState(eq("session-1"), eq("live-turn"), anyLong())).thenReturn(Optional.of(
                new ObjectMapper().createObjectNode().put("sessionPresent", true).put("active", true)
                        .put("activeTurnId", "live-turn").put("backgroundTaskCount", 0)));
        service.resumeAllSessions();
        assertThat(turns.currentTurnId("session-1")).contains("live-turn");
        assertThat(service.isRunning("session-1")).isTrue();
        verify(sidecar, never()).resumeSession(anyString(), any(), anyString(), anyString(), any(), any(), any(),
                anyString(), anyBoolean(), any(), any(), any(), any(), anyList());
        verify(repository, never()).updateStatus("session-1", SessionStatus.IDLE);
        service.onSidecarEvent("session-1", new ObjectMapper().createObjectNode()
                .put("type", "result").put("turnId", "live-turn").put("stopReason", "interrupted"));
        assertThat(turns.currentTurnId("session-1")).isEmpty();
        assertThat(service.isRunning("session-1")).isFalse();
        verify(repository).touch(eq("session-1"), eq(SessionStatus.IDLE), anyLong());
    }

    @Test
    void shouldNotDeclareAnUnconfirmedRecoveryIdle() {
        ReflectionTestUtils.setField(context, "status", SessionStatus.RUNNING);
        var turns = (TurnLifecycleCoordinator) ReflectionTestUtils.getField(service, "turnLifecycle");
        turns.adopt("session-1", "unconfirmed-turn");
        when(sidecar.querySessionState(anyString(), any(), anyLong())).thenReturn(Optional.empty());
        service.resumeAllSessions();
        assertThat(turns.currentTurnId("session-1")).contains("unconfirmed-turn");
        assertThat(service.isRunning("session-1")).isTrue();
        verify(repository, never()).updateStatus(anyString(), eq(SessionStatus.IDLE));
    }

    @Test
    @SuppressWarnings("unchecked")
    void shouldKeepTurnIdentityWhenOnlyTransportDisconnects() throws Exception {
        ReflectionTestUtils.setField(context, "status", SessionStatus.RUNNING);
        var turns = (TurnLifecycleCoordinator) ReflectionTestUtils.getField(service, "turnLifecycle");
        turns.adopt("session-1", "live-turn");
        ((java.util.Set<WebSocketSession>) ReflectionTestUtils.getField(context, "viewers")).add(socket);
        ((java.util.concurrent.atomic.AtomicBoolean) ReflectionTestUtils.getField(service, "recovering")).set(true);
        service.onSidecarEvent(null, null);
        assertThat(turns.currentTurnId("session-1")).contains("live-turn");
        assertThat(service.isRunning("session-1")).isTrue();
        verify(repository, never()).touch(anyString(), any(), anyLong());
        verify(socket).sendMessage(argThat(message -> message.getPayload().toString().contains("SIDECAR_DOWN")
                && message.getPayload().toString().contains("\"terminal\":false")));
    }

    @Test
    void shouldNotResetTheTurnOnImmediateTransportReconnect() {
        ReflectionTestUtils.setField(context, "status", SessionStatus.RUNNING);
        var turns = (TurnLifecycleCoordinator) ReflectionTestUtils.getField(service, "turnLifecycle");
        turns.adopt("session-1", "live-turn");
        when(sidecar.isConnected()).thenReturn(false);
        ((java.util.concurrent.atomic.AtomicBoolean) ReflectionTestUtils.getField(service, "recovering")).set(true);
        assertThat((Boolean) ReflectionTestUtils.invokeMethod(service, "ensureSessionResumable", context)).isFalse();
        assertThat(turns.currentTurnId("session-1")).contains("live-turn");
        assertThat(service.isRunning("session-1")).isTrue();
        verify(repository, never()).updateStatus(anyString(), any());
    }

    @Test
    void shouldRetainInterruptionWhenSidecarConfirmsTheTurnIsGone() {
        ReflectionTestUtils.setField(context, "status", SessionStatus.RUNNING);
        var turns = (TurnLifecycleCoordinator) ReflectionTestUtils.getField(service, "turnLifecycle");
        turns.adopt("session-1", "lost-turn");
        when(sidecar.querySessionState(anyString(), any(), anyLong())).thenReturn(Optional.of(
                new ObjectMapper().createObjectNode().put("sessionPresent", false).put("active", false)));
        assertThat(service.resumeAllSessions()).isTrue();
        assertThat(turns.currentTurnId("session-1")).isEmpty();
        assertThat(ReflectionTestUtils.getField(context, "status")).isEqualTo(SessionStatus.INTERRUPTED);
        verify(repository).updateStatus("session-1", SessionStatus.INTERRUPTED);
    }

    @Test
    void shouldNotOverwriteANewerTurnWhileInspectingRecovery() {
        ReflectionTestUtils.setField(context, "status", SessionStatus.RUNNING);
        var turns = (TurnLifecycleCoordinator) ReflectionTestUtils.getField(service, "turnLifecycle");
        turns.adopt("session-1", "old-turn");
        when(sidecar.querySessionState(anyString(), any(), anyLong())).thenAnswer(invocation -> {
            assertThat(Thread.holdsLock(context)).isFalse();
            turns.adopt("session-1", "new-turn");
            return Optional.of(new ObjectMapper().createObjectNode().put("sessionPresent", true).put("active", false));
        });
        assertThat(service.resumeAllSessions()).isFalse();
        assertThat(turns.currentTurnId("session-1")).contains("new-turn");
        assertThat(service.isRunning("session-1")).isTrue();
        verify(repository, never()).updateStatus(anyString(), any());
    }

    @Test
    void shouldKeepRecoveryLockedWhileBackgroundTasksRemain() {
        ReflectionTestUtils.setField(context, "status", SessionStatus.RUNNING);
        var turns = (TurnLifecycleCoordinator) ReflectionTestUtils.getField(service, "turnLifecycle");
        turns.adopt("session-1", "pending-cleanup");
        when(sidecar.querySessionState(anyString(), any(), anyLong())).thenReturn(Optional.of(
                new ObjectMapper().createObjectNode().put("sessionPresent", true).put("active", false)
                        .put("backgroundTaskCount", 1)));
        assertThat(service.resumeAllSessions()).isFalse();
        assertThat(turns.currentTurnId("session-1")).contains("pending-cleanup");
        verify(repository, never()).updateStatus(anyString(), any());
    }

    @Test
    void shouldAdoptTheConfirmedLiveTurnIfJavaLostItsIdentity() {
        var turns = (TurnLifecycleCoordinator) ReflectionTestUtils.getField(service, "turnLifecycle");
        when(sidecar.querySessionState(anyString(), any(), anyLong())).thenReturn(Optional.of(
                new ObjectMapper().createObjectNode().put("sessionPresent", true).put("active", true)
                        .put("activeTurnId", "native-live-turn")));
        assertThat(service.resumeAllSessions()).isTrue();
        assertThat(turns.currentTurnId("session-1")).contains("native-live-turn");
        assertThat(service.isRunning("session-1")).isTrue();
    }

    @Test
    void shouldNotUnlockAnActiveSessionWithoutTurnIdentity() {
        ReflectionTestUtils.setField(context, "status", SessionStatus.RUNNING);
        var turns = (TurnLifecycleCoordinator) ReflectionTestUtils.getField(service, "turnLifecycle");
        turns.adopt("session-1", "old-turn");
        when(sidecar.querySessionState(anyString(), any(), anyLong())).thenReturn(Optional.of(
                new ObjectMapper().createObjectNode().put("sessionPresent", true).put("active", true)));
        assertThat(service.resumeAllSessions()).isFalse();
        assertThat(turns.currentTurnId("session-1")).contains("old-turn");
        verify(repository, never()).updateStatus(anyString(), any());
    }

    private <T> T dependency(Class<T> type) {
        return type.cast(dependencies.get(type));
    }
}
