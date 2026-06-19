package com.exceptioncoder.toolbox.wechat.api.dto;

/**
 * 会话列表项（DB 聚合）：带末条消息预览 + 时间，供前端微信首页样式渲染。
 * unread 不在库里维护，固定 0；实时未读由前端用 sidecar /sessions 覆盖。
 */
public record ChatListItem(
        String name,
        String lastSender,
        String lastContent,
        String lastType,
        long lastAt) {
}
