package com.exceptioncoder.toolbox.common.launchintent.domain;

/**
 * 可持久化、可确认的跨页面启动意图。
 *
 * @param id 意图 ID
 * @param protocolVersion 协议版本
 * @param type 意图类型
 * @param payloadJson JSON payload
 * @param state 消费状态
 * @param lastError 最近一次消费错误
 * @param createdAt 创建时间
 * @param expiresAt 过期时间
 * @param acknowledgedAt 确认时间
 * @param updatedAt 更新时间
 */
public record LaunchIntent(
        String id,
        int protocolVersion,
        String type,
        String payloadJson,
        LaunchIntentState state,
        String lastError,
        long createdAt,
        long expiresAt,
        Long acknowledgedAt,
        long updatedAt) {
}
