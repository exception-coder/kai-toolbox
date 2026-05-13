package com.exceptioncoder.toolbox.webterm.api.dto;

import com.exceptioncoder.toolbox.webterm.domain.ClaudeSession;

/**
 * liveSessionId 为非 null 表示这条记录目前还有一个活着的 PTY 进程，
 * 前端可以走 WebSocket attach 直接接回原终端，看到中断前后的完整输出。
 */
public record ClaudeSessionView(
        String id,
        String cwd,
        String shell,
        String title,
        long startedAt,
        long lastSeenAt,
        String liveSessionId
) {
    public static ClaudeSessionView from(ClaudeSession s, String liveSessionId) {
        return new ClaudeSessionView(
                s.getId(),
                s.getCwd(),
                s.getShell(),
                s.getTitle(),
                s.getStartedAt(),
                s.getLastSeenAt(),
                liveSessionId);
    }
}
