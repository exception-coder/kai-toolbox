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
}
