package com.exceptioncoder.toolbox.claudechat.domain.autopilot;

import java.time.Instant;

/** 当前会话唯一的自动监督运行；步骤证据由独立表追加保存。 */
public record SessionAutopilotRun(
        String id,
        String sessionId,
        String goal,
        AutopilotCompletionPolicy completionPolicy,
        AutopilotState state,
        String reason,
        OpenSpecExecutionContext context,
        int turnCount,
        int maxTurns,
        int noProgressCount,
        int maxNoProgress,
        boolean autoArchive,
        boolean skillActivated,
        String skillPath,
        String skillVersion,
        String skillFingerprint,
        boolean runtimeSupervision,
        int completedTasks,
        int totalTasks,
        AutopilotDisposition latestDisposition,
        String latestSummary,
        String latestNextAction,
        String latestRemainingWorkJson,
        String latestEvidenceJson,
        Instant latestReportAt,
        Instant startedAt,
        Instant deadlineAt,
        Instant updatedAt) {

    public SessionAutopilotRun {
        if (id == null || id.isBlank() || sessionId == null || sessionId.isBlank()) {
            throw new IllegalArgumentException("自动监督运行与会话标识不能为空");
        }
        if (goal == null || goal.isBlank()) {
            throw new IllegalArgumentException("自动监督目标不能为空");
        }
        if (completionPolicy == null || state == null || context == null) {
            throw new IllegalArgumentException("自动监督策略、状态和执行上下文不能为空");
        }
        if (turnCount < 0 || maxTurns < 1 || turnCount > maxTurns) {
            throw new IllegalArgumentException("自动监督轮次预算不合法");
        }
        if (noProgressCount < 0 || maxNoProgress < 1) {
            throw new IllegalArgumentException("自动监督无进展预算不合法");
        }
        if (completedTasks < 0 || totalTasks < completedTasks) {
            throw new IllegalArgumentException("OpenSpec 任务进度不合法");
        }
        if (startedAt == null || deadlineAt == null || updatedAt == null) {
            throw new IllegalArgumentException("自动监督时间边界不能为空");
        }
    }

    public boolean budgetAvailable(Instant now) {
        return state == AutopilotState.ACTIVE && turnCount < maxTurns && now.isBefore(deadlineAt);
    }
}
