package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReadinessFailureGuardTest {
    private final ReadinessFailureGuard guard = new ReadinessFailureGuard();

    @Test
    void countsDistinctCallsAcrossTurnsButNotReplayedEvents() {
        var run = run(1, "rev-1", "1.3");
        assertThat(guard.observe(run, event("a", "missing configuration", true))).isFalse();
        assertThat(guard.observe(run, event("a", "missing configuration", true))).isFalse();
        assertThat(guard.observe(run, event("b", "missing configuration", true))).isTrue();
    }

    @Test
    void decodesMcpBusinessRejectionWithoutTransportErrorAndIgnoresResponseVersion() {
        var run = run(1, "rev-1", "1.3");
        String output = "{\"content\":[{\"text\":\"{\\\"allowed\\\":false,\\\"code\\\":\\\"CONFIG_MISSING\\\",\\\"message\\\":\\\"missing configuration\\\",\\\"version\\\":%d}\"}]}";
        assertThat(guard.observe(run, event("a", output.formatted(1), false))).isFalse();
        assertThat(guard.observe(run, event("b", output.formatted(2), false))).isTrue();
    }

    @Test
    void successAndDifferentFailureResetConsecutiveCount() {
        var run = run(1, "rev-1", "1.3");
        assertThat(guard.observe(run, event("a", "missing configuration", true))).isFalse();
        assertThat(guard.observe(run, event("b", "{\"allowed\":true}", false))).isFalse();
        assertThat(guard.observe(run, event("c", "missing configuration", true))).isFalse();
        assertThat(guard.observe(run, event("d", "scope gap", true))).isFalse();
        assertThat(guard.observe(run, event("e", "scope gap", true))).isTrue();
    }

    @Test
    void resumeRevisionAndTaskChangesStartNewStreak() {
        assertThat(guard.observe(run(1, "rev-1", "1.3"), event("a", "missing", true))).isFalse();
        assertThat(guard.observe(run(2, "rev-1", "1.3"), event("b", "missing", true))).isFalse();
        assertThat(guard.observe(run(2, "rev-2", "1.3"), event("c", "missing", true))).isFalse();
        assertThat(guard.observe(run(2, "rev-2", "1.4"), event("d", "missing", true))).isFalse();
    }

    @Test
    void capacityAndNetworkTimeoutDoNotBecomeConfigurationBlockers() {
        var run = run(1, "rev-1", "1.3");
        for (String failure : new String[]{"Selected model is at capacity", "request timed out", "ECONNRESET"}) {
            assertThat(guard.observe(run, event(failure + "a", failure, true))).isFalse();
            assertThat(guard.observe(run, event(failure + "b", failure, true))).isFalse();
        }
    }

    @Test
    void ordinaryTestFailuresAndMissingCallIdentityAreNotCounted() {
        var run = run(1, "rev-1", "1.3");
        for (int i = 0; i < 3; i++) {
            assertThat(guard.observe(run, new SessionReadinessResultEvent("s", "t", "" + i,
                    "forge/run_execution_verification", "assertion failed", true))).isFalse();
            assertThat(guard.observe(run, event(null, "missing configuration", true))).isFalse();
        }
    }

    private SessionReadinessResultEvent event(String call, String output, boolean error) {
        return new SessionReadinessResultEvent("s", "turn-" + call, call,
                "forge/check_execution_readiness", output, error);
    }

    private SessionAutopilotRun run(long generation, String revision, String task) {
        var run = mock(SessionAutopilotRun.class);
        when(run.id()).thenReturn("run-1");
        when(run.context()).thenReturn(new OpenSpecExecutionContext("D:/repo", "repo", "main", "workspace",
                "change", revision, task, 1, OpenSpecExecutionPhase.APPLY, "agent-session", generation, 0));
        return run;
    }
}
