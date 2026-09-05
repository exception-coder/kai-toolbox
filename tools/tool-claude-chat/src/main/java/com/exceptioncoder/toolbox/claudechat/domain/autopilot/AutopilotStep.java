package com.exceptioncoder.toolbox.claudechat.domain.autopilot;

import java.time.Instant;

/** 单个 settled turn 的幂等续跑决策证据。 */
public record AutopilotStep(
        String runId,
        long generation,
        String predecessorTurnId,
        String messageId,
        OpenSpecExecutionPhase phase,
        String taskId,
        String disposition,
        String summary,
        String evidenceJson,
        String progressFingerprint,
        Instant createdAt) {
}
