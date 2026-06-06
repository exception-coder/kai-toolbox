package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;

/**
 * 会话列表视图。
 *
 * @param live true 表示该会话当前仍挂在活跃 sidecar 上（可 attach 接回进行中的一轮）；
 *             false 表示只能 switchSession 触发 resume 重新拉起上下文。
 */
public record ClaudeChatSessionView(
        String id,
        String cwd,
        String title,
        String sdkSessionId,
        String engine,
        SessionStatus status,
        long startedAt,
        long lastSeenAt,
        boolean live
) {
    public static ClaudeChatSessionView from(ClaudeChatSession s, boolean live) {
        return new ClaudeChatSessionView(
                s.getId(), s.getCwd(), s.getTitle(), s.getSdkSessionId(),
                s.getEngine() == null ? "claude" : s.getEngine(),
                s.getStatus(), s.getStartedAt(), s.getLastSeenAt(), live);
    }
}
