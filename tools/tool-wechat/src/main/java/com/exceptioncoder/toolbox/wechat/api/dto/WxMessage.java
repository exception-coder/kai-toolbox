package com.exceptioncoder.toolbox.wechat.api.dto;

/**
 * sidecar 返回的一条原始消息（/messages、/listen/poll）。字段都当不可信入参，
 * 缺失给空串，由 Java 侧落库前再归一。
 */
public record WxMessage(
        String chat,
        String sender,
        String content,
        String type,
        String time,
        String msgId) {
}
