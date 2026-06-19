package com.exceptioncoder.toolbox.aichat.domain;

import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

/** 一条消息的持久化实体，对应表 ai_chat_message。 */
@Getter
@Setter
@Builder
public class ChatMessage {

    private String id;
    private String conversationId;
    private MessageRole role;
    private String content;
    /** 助手消息所用模型；用户/系统消息为空。 */
    private String model;
    /** 附件引用 JSON 数组（AttachmentRef[]），可空；仅多模态用户消息有值。 */
    private String attachmentsJson;
    private MessageStatus status;
    private long createdAt;

    /** 本轮流式耗时（毫秒），仅助手消息有值。 */
    private Long latencyMs;
    /** 输入（prompt）token 数，含缓存读，仅助手消息有值。 */
    private Long promptTokens;
    /** 输出（completion）token 数，仅助手消息有值。 */
    private Long completionTokens;
    /** 总 token 数，仅助手消息有值。 */
    private Long totalTokens;
    /** 命中缓存的输入 token 数（≈不计费），网关未返回则为空。 */
    private Long cachedTokens;
}
