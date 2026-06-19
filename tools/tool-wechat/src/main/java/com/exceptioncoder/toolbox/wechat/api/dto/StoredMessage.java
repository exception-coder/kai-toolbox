package com.exceptioncoder.toolbox.wechat.api.dto;

/** 落库后的消息视图（带自增 id 与入库时间，供前端历史/检索展示）。 */
public record StoredMessage(
        long id,
        String chat,
        String sender,
        String content,
        String type,
        String sentTime,
        String msgId,
        long createdAt) {
}
