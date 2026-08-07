package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionPlanState;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;

/**
 * 会话列表视图。
 *
 * @param live true 表示该会话当前仍挂在活跃 sidecar 上（可 attach 接回进行中的一轮）；
 *             false 表示只能 switchSession 触发 resume 重新拉起上下文。
 * @param transcriptMissing true 表示该会话在磁盘上的 transcript 已不存在，resume 必然失败、
 *             上下文无法恢复；列表里据此红标，让用户点进去之前就知道，而不是发一条消息后才收到报错。
 * @param planExpired true 表示规划已过期，输入和发送入口必须锁定
 * @param planExpiredAt 最近一次标记规划过期的时间
 * @param planUnlockedAt 最近一次显式解锁的时间
 */
public record ClaudeChatSessionView(
        String id,
        String cwd,
        String title,
        String sdkSessionId,
        String engine,
        String engines,
        String providerKind,
        String providerBaseUrl,
        String codexHome,
        String group,
        String subgroup,
        boolean favorite,
        SessionStatus status,
        long startedAt,
        long lastSeenAt,
        boolean live,
        boolean transcriptMissing,
        boolean planExpired,
        Long planExpiredAt,
        Long planUnlockedAt
) {
    public static ClaudeChatSessionView from(ClaudeChatSession s, boolean live) {
        return from(s, live, false);
    }

    public static ClaudeChatSessionView from(ClaudeChatSession s, boolean live, boolean transcriptMissing) {
        return from(s, live, transcriptMissing, null);
    }

    /**
     * 将持久化会话及可选规划状态转换为列表视图。
     *
     * @param s 会话元数据
     * @param live 是否连接活跃 sidecar
     * @param transcriptMissing transcript 是否缺失
     * @param planState 规划状态，缺失按未过期处理
     * @return 会话列表视图
     */
    public static ClaudeChatSessionView from(ClaudeChatSession s, boolean live, boolean transcriptMissing,
                                             SessionPlanState planState) {
        String engine = s.getEngine() == null ? "claude" : s.getEngine();
        String engines = s.getEngines() == null || s.getEngines().isBlank() ? engine : s.getEngines();
        String providerBaseUrl = s.getApiBaseUrl() == null || s.getApiBaseUrl().isBlank() ? null : s.getApiBaseUrl();
        String providerKind = providerBaseUrl == null ? "official" : "thirdParty";
        String group = s.getGroupName() == null || s.getGroupName().isBlank() ? null : s.getGroupName();
        String subgroup = s.getSubgroupName() == null || s.getSubgroupName().isBlank() ? null : s.getSubgroupName();
        return new ClaudeChatSessionView(
                s.getId(), s.getCwd(), s.getTitle(), s.getSdkSessionId(),
                engine, engines, providerKind, providerBaseUrl, s.getCodexHome(), group, subgroup, s.isFavorite(),
                s.getStatus(), s.getStartedAt(), s.getLastSeenAt(), live, transcriptMissing,
                planState != null && planState.planExpired(),
                planState == null ? null : planState.expiredAt(),
                planState == null ? null : planState.unlockedAt());
    }
}
