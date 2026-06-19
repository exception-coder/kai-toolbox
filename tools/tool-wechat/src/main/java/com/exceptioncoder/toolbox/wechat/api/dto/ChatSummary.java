package com.exceptioncoder.toolbox.wechat.api.dto;

/** 会话列表项。来自 sidecar /sessions（实时）或 DB（最近会话聚合）。 */
public record ChatSummary(String name, int unread) {
}
