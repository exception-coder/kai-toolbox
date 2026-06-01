package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 历史会话的单条消息项，从 transcript jsonl 解析而来。
 * 形状与前端 ChatItem 对齐；按 kind 取用对应字段，其余为 null。
 * id 用 "h{全局行索引}"，与实时项 "i{seq}" 隔离，避免渲染 key 冲突。
 */
public record ChatMessageView(
        String id,
        String kind,        // user / assistant / tool / result
        String text,        // user / assistant
        String toolName,    // tool
        Object input,       // tool
        String output,      // tool
        Boolean isError,    // tool
        String stopReason   // result
) {
    public static ChatMessageView user(String id, String text) {
        return new ChatMessageView(id, "user", text, null, null, null, null, null);
    }

    public static ChatMessageView assistant(String id, String text) {
        return new ChatMessageView(id, "assistant", text, null, null, null, null, null);
    }

    public static ChatMessageView tool(String id, String toolName, Object input, String output, Boolean isError) {
        return new ChatMessageView(id, "tool", null, toolName, input, output, isError, null);
    }

    public static ChatMessageView result(String id, String stopReason) {
        return new ChatMessageView(id, "result", null, null, null, null, null, stopReason);
    }
}
