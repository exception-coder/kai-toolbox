package com.exceptioncoder.toolbox.aichat.domain;

import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

/** 一条会话的持久化实体，对应表 ai_chat_conversation。 */
@Getter
@Setter
@Builder
public class Conversation {

    private String id;
    private String title;
    /** 当前默认模型名（4sapi 模型 id）；发送时可临时覆盖并回写。 */
    private String model;
    /** 会话类型：chat（对话）/ image（绘图）/ video（视频）。决定左侧列表按 tab 归类。 */
    private String kind;
    /** 会话级系统提示，可空。 */
    private String systemPrompt;
    /** 采样温度，可空（空则取配置默认）。 */
    private Double temperature;
    /** 最大输出 token，可空（空则不限）。 */
    private Integer maxTokens;
    private long createdAt;
    private long updatedAt;
}
