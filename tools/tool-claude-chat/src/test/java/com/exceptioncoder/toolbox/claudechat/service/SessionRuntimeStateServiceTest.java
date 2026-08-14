package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.SessionRuntimeStateView;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 验证全链路状态聚合与发送门禁。 */
class SessionRuntimeStateServiceTest {

    private static final long NOW = 10_000L;

    @Test
    void shouldDetectGhostRunningWhenSidecarAlreadyStopped() {
        SessionRuntimeStateView state = assess(SessionStatus.RUNNING, SessionStatus.RUNNING, "turn-1",
                sidecar(false, null));

        assertThat(state.consistency()).isEqualTo("GHOST_RUNNING");
        assertThat(state.effectiveStatus()).isEqualTo("IDLE");
        assertThat(state.canSend()).isFalse();
        assertThat(state.canInterrupt()).isTrue();
    }

    @Test
    void shouldDetectBackendStateLossWhenSidecarStillRuns() {
        SessionRuntimeStateView state = assess(SessionStatus.IDLE, SessionStatus.IDLE, null,
                sidecar(true, "turn-sidecar"));

        assertThat(state.consistency()).isEqualTo("BACKEND_STATE_LOST");
        assertThat(state.effectiveStatus()).isEqualTo("RUNNING");
        assertThat(state.canSend()).isFalse();
    }

    @Test
    void shouldAllowSendOnlyForFreshConsistentIdleState() {
        SessionRuntimeStateView state = assess(SessionStatus.IDLE, SessionStatus.IDLE, null,
                sidecar(false, null));

        assertThat(state.consistency()).isEqualTo("CONSISTENT");
        assertThat(state.effectiveStatus()).isEqualTo("IDLE");
        assertThat(state.canSend()).isTrue();
        assertThat(state.canInterrupt()).isFalse();
    }

    @Test
    void shouldRejectTurnMismatch() {
        SessionRuntimeStateView state = assess(SessionStatus.RUNNING, SessionStatus.RUNNING, "turn-java",
                sidecar(true, "turn-sidecar"));

        assertThat(state.consistency()).isEqualTo("TURN_MISMATCH");
        assertThat(state.canSend()).isFalse();
    }

    @Test
    void shouldKeepQueueBlockedWhileBackgroundTasksRemain() {
        SessionRuntimeStateService.SidecarObservation sidecar =
                new SessionRuntimeStateService.SidecarObservation(
                        true, false, false, 2, null, null, "idle", NOW);
        SessionRuntimeStateView state = assess(SessionStatus.IDLE, SessionStatus.IDLE, null, sidecar);

        assertThat(state.effectiveStatus()).isEqualTo("BACKGROUND_RUNNING");
        assertThat(state.canSend()).isFalse();
    }

    private static SessionRuntimeStateView assess(SessionStatus persisted, SessionStatus backendStatus,
                                                  String backendTurnId,
                                                  SessionRuntimeStateService.SidecarObservation sidecar) {
        ClaudeChatSession stored = ClaudeChatSession.builder()
                .id("session-1")
                .cwd("D:/workspace")
                .status(persisted)
                .startedAt(1L)
                .lastSeenAt(1L)
                .build();
        SessionRuntimeStateService.BackendObservation backend =
                new SessionRuntimeStateService.BackendObservation(
                        backendStatus, backendTurnId, false, 0, 1, NOW);
        return SessionRuntimeStateService.assess(stored, backend, true, sidecar, NOW);
    }

    private static SessionRuntimeStateService.SidecarObservation sidecar(boolean active, String turnId) {
        return new SessionRuntimeStateService.SidecarObservation(
                true, active, false, 0, turnId, active ? "working" : null,
                active ? "running" : "idle", NOW);
    }
}
