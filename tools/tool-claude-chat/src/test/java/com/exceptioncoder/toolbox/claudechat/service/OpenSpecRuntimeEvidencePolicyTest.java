package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotCompletionPolicy;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotState;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class OpenSpecRuntimeEvidencePolicyTest {

    @TempDir
    Path projectDirectory;

    @Test
    void acceptsFreshMatchingEvidence() {
        Instant now = Instant.parse("2026-09-02T12:00:00Z");
        assertThat(OpenSpecRuntimeEvidencePolicy.accepts(run(now.minusSeconds(30), "fingerprint"),
                projectDirectory, "fingerprint", now)).isTrue();
    }

    @Test
    void rejectsStaleOrFingerprintMismatchedEvidence() {
        Instant now = Instant.parse("2026-09-02T12:00:00Z");
        assertThat(OpenSpecRuntimeEvidencePolicy.accepts(run(now.minusSeconds(301), "fingerprint"),
                projectDirectory, "fingerprint", now)).isFalse();
        assertThat(OpenSpecRuntimeEvidencePolicy.accepts(run(now.minusSeconds(30), "old"),
                projectDirectory, "current", now)).isFalse();
    }

    private SessionAutopilotRun run(Instant updatedAt, String fingerprint) {
        OpenSpecExecutionContext context = new OpenSpecExecutionContext(projectDirectory.toString(), "repo",
                "main", fingerprint, "board", "revision", "1.1", 1,
                OpenSpecExecutionPhase.APPLY, "agent", 1, 0);
        return new SessionAutopilotRun("run", "session", "goal", AutopilotCompletionPolicy.OPEN_SPEC_STRICT,
                AutopilotState.ACTIVE, null, context, 1, 10, 0, 3, false, true,
                "skill", "1", "skill-fingerprint", true, 0, 1, null,
                null, null, null, null, null, updatedAt.minusSeconds(60),
                updatedAt.plusSeconds(600), updatedAt);
    }
}
