package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 磁盘上的 Claude Code 历史会话视图。
 * 来源 ~/.claude/projects/&lt;编码cwd&gt;/&lt;sdkSessionId&gt;.jsonl。
 */
public record HistorySessionView(
        String sdkSessionId,
        String cwd,
        String title,
        long lastModified,
        int messageCount
) {}
