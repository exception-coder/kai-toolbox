package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 单个会话的累计用量，由后端读取该会话 transcript（~/.claude/projects/.../{sessionId}.jsonl）
 * 把每轮 assistant 的 message.usage 求和得到——不依赖前端加载了多少条消息，整会话准确总和。
 *
 * @param inputTokens       输入 token 累计（不含缓存）
 * @param outputTokens      输出 token 累计
 * @param cacheReadTokens   缓存读 token 累计（命中，≈不计费）
 * @param cacheCreateTokens 缓存写 token 累计
 * @param totalTokens       总计（input+output+cacheRead+cacheCreate，与前端 parseUsage 口径一致）
 * @param turns             有输出的轮次数
 */
public record SessionUsageView(
        long inputTokens,
        long outputTokens,
        long cacheReadTokens,
        long cacheCreateTokens,
        long totalTokens,
        int turns) {

    public static SessionUsageView empty() {
        return new SessionUsageView(0, 0, 0, 0, 0, 0);
    }
}
