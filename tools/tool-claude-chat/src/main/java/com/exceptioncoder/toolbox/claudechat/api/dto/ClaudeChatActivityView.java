package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * Claude Chat 当前活动工作快照，供进程管理器在自动更新前做只读安全判断。
 *
 * @param active 是否存在任何不可中断的活动工作
 * @param safeToRestart 仅当所有活动计数都为零时为 true
 * @param activeSessionCount 至少命中运行、状态不确定、未决请求或后台任务之一的会话数
 * @param runningTurnCount Java 内存中处于 RUNNING 的会话数
 * @param uncertainSessionCount sidecar 断连后处于 INTERRUPTED、尚未确认恢复结果的会话数
 * @param pendingRequestCount 正在等待权限确认或问题回答的会话数
 * @param backgroundTaskCount sidecar 上报的后台任务总数
 * @param oneShotCount 正在执行的一次性 Agent 调用数
 * @param observedAt 快照生成时间（epoch millis）
 */
public record ClaudeChatActivityView(
        boolean active,
        boolean safeToRestart,
        int activeSessionCount,
        int runningTurnCount,
        int uncertainSessionCount,
        int pendingRequestCount,
        int backgroundTaskCount,
        int oneShotCount,
        long observedAt
) {
}
