package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;

/** 判定自动监督记录是否仍可作为看板当前状态证据。 */
final class OpenSpecRuntimeEvidencePolicy {

    private static final Duration MAX_AGE = Duration.ofMinutes(5);

    private OpenSpecRuntimeEvidencePolicy() {
    }

    static boolean accepts(SessionAutopilotRun run, Path projectDirectory,
                           String currentWorkspaceFingerprint, Instant now) {
        Path evidenceRoot = Path.of(run.context().projectRoot()).toAbsolutePath().normalize();
        return evidenceRoot.equals(projectDirectory.toAbsolutePath().normalize())
                && run.updatedAt().isAfter(now.minus(MAX_AGE))
                && run.context().workspaceFingerprint().equals(currentWorkspaceFingerprint);
    }
}
