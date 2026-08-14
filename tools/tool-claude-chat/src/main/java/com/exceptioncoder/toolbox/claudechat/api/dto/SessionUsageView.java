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
 * @param steps             有效助手输出与工具调用的累计步骤数
 * @param modelDurationMs   各轮墙钟耗时扣除可测工具耗时后的累计值
 * @param toolDurationMs    可测工具调用耗时累计
 * @param averageTtftMs     用户输入到首个模型动作的平均耗时；无有效样本时为空
 * @param ttftSamples       首响应耗时有效样本数，用于跨引擎段加权聚合
 * @param outputTokensPerSecond 输出 Token 除以模型处理秒数；无有效时长时为空
 */
public record SessionUsageView(
        long inputTokens,
        long outputTokens,
        long cacheReadTokens,
        long cacheCreateTokens,
        long totalTokens,
        int turns,
        int steps,
        long modelDurationMs,
        long toolDurationMs,
        Long averageTtftMs,
        int ttftSamples,
        Double outputTokensPerSecond) {

    public static SessionUsageView empty() {
        return new SessionUsageView(0, 0, 0, 0, 0, 0, 0, 0, 0, null, 0, null);
    }
}
