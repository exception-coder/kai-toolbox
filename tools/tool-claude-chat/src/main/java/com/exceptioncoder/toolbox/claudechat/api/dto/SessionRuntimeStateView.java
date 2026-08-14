package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 会话从浏览器、Java、Sidecar到Agent的全链路运行状态快照。
 *
 * @param sessionId 逻辑会话ID
 * @param effectiveStatus 聚合后的有效状态
 * @param consistency 各层状态一致性
 * @param persistedStatus SQLite中的恢复状态
 * @param backendStatus Java内存中的状态
 * @param browserConnected 是否存在浏览器观察者
 * @param javaSidecarConnected Java与Sidecar连接是否可用
 * @param sidecarSessionPresent Sidecar是否存在该会话，无法确认时为null
 * @param sidecarActive Sidecar是否存在活动轮次，无法确认时为null
 * @param pendingDecision 是否等待用户确认，无法确认时为null
 * @param backgroundTaskCount 后台任务数，无法确认时为null
 * @param activeTurnId 当前活动轮次ID
 * @param phase 当前执行阶段
 * @param agentState Agent适配层状态
 * @param lastHeartbeatAt Sidecar最后采样时间
 * @param observedAt 聚合快照时间
 * @param stale 快照是否过期
 * @param canSend 是否允许立即发送
 * @param canQueue 是否允许加入待发送队列
 * @param canInterrupt 是否允许中断
 * @param reason 判定原因
 * @param recommendedAction 建议动作
 */
public record SessionRuntimeStateView(
        String sessionId,
        String effectiveStatus,
        String consistency,
        String persistedStatus,
        String backendStatus,
        boolean browserConnected,
        boolean javaSidecarConnected,
        Boolean sidecarSessionPresent,
        Boolean sidecarActive,
        Boolean pendingDecision,
        Integer backgroundTaskCount,
        String activeTurnId,
        String phase,
        String agentState,
        Long lastHeartbeatAt,
        long observedAt,
        boolean stale,
        boolean canSend,
        boolean canQueue,
        boolean canInterrupt,
        String reason,
        String recommendedAction
) {
}
