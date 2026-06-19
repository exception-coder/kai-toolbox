package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.Map;

/**
 * 历史会话的单条消息项，从 transcript jsonl 解析而来。
 * 形状与前端 ChatItem 对齐；按 kind 取用对应字段，其余为 null。
 * id 用 "h{全局行索引}"，与实时项 "i{seq}" 隔离，避免渲染 key 冲突。
 * ts：该消息时间（epoch ms，来自行级 timestamp），可空。
 * usage/latencyMs：仅 result 项有——由本轮 assistant 用量聚合 + 时间戳推导（历史 token/耗时）。
 */
public record ChatMessageView(
        String id,
        String kind,                 // user / assistant / tool / result
        String text,                 // user / assistant
        String toolName,             // tool
        Object input,                // tool
        String output,               // tool
        Boolean isError,             // tool
        String stopReason,           // result
        Long ts,                     // 该消息时间（epoch ms），可空
        Map<String, Object> usage,   // result：本轮 token 用量（input/output/cache），可空
        Long latencyMs               // result：本轮耗时（ms），可空
) {
    public static ChatMessageView user(String id, String text, Long ts) {
        return new ChatMessageView(id, "user", text, null, null, null, null, null, ts, null, null);
    }

    public static ChatMessageView assistant(String id, String text, Long ts) {
        return new ChatMessageView(id, "assistant", text, null, null, null, null, null, ts, null, null);
    }

    public static ChatMessageView tool(String id, String toolName, Object input, String output, Boolean isError, Long ts) {
        return new ChatMessageView(id, "tool", null, toolName, input, output, isError, null, ts, null, null);
    }

    public static ChatMessageView result(String id, String stopReason, Long ts, Map<String, Object> usage, Long latencyMs) {
        return new ChatMessageView(id, "result", null, null, null, null, null, stopReason, ts, usage, latencyMs);
    }
}
