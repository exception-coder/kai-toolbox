package com.exceptioncoder.toolbox.aichat.api.dto;

import java.util.List;

/**
 * 消息视图。
 *
 * @param role        USER/ASSISTANT/SYSTEM
 * @param model       助手消息所用模型，用户消息为 null
 * @param attachments 多模态用户消息的附件，否则空列表
 * @param status           DONE/INTERRUPTED/ERROR
 * @param latencyMs        助手消息本轮耗时（毫秒），用户消息为 null
 * @param promptTokens     输入 token（含缓存读），用户消息为 null
 * @param completionTokens 输出 token，用户消息为 null
 * @param totalTokens      总 token，用户消息为 null
 * @param cachedTokens     命中缓存的输入 token，网关未返回时为 null
 */
public record MessageView(
        String id,
        String conversationId,
        String role,
        String content,
        String model,
        List<AttachmentView> attachments,
        String status,
        long createdAt,
        Long latencyMs,
        Long promptTokens,
        Long completionTokens,
        Long totalTokens,
        Long cachedTokens) {
}
