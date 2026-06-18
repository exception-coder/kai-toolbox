package com.exceptioncoder.toolbox.aichat.api.dto;

import java.util.List;

/**
 * 发送一条用户消息。
 *
 * @param conversationId 会话 id，必填
 * @param content        用户文本；与 attachmentIds 不可同时为空
 * @param attachmentIds  已上传附件 id；非多模态模型传图将被拒
 * @param model          覆盖会话默认模型；非空时同步持久化为会话默认
 * @param temperature    覆盖会话默认温度
 * @param maxTokens      覆盖会话默认 maxTokens
 */
public record SendMessageRequest(
        String conversationId,
        String content,
        List<String> attachmentIds,
        String model,
        Double temperature,
        Integer maxTokens) {
}
