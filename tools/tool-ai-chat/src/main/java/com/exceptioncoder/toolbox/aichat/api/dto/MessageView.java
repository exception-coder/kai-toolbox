package com.exceptioncoder.toolbox.aichat.api.dto;

import java.util.List;

/**
 * 消息视图。
 *
 * @param role        USER/ASSISTANT/SYSTEM
 * @param model       助手消息所用模型，用户消息为 null
 * @param attachments 多模态用户消息的附件，否则空列表
 * @param status      DONE/INTERRUPTED/ERROR
 */
public record MessageView(
        String id,
        String conversationId,
        String role,
        String content,
        String model,
        List<AttachmentView> attachments,
        String status,
        long createdAt) {
}
