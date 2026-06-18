package com.exceptioncoder.toolbox.aichat.api.dto;

import java.util.List;

/**
 * 一页消息（按 createdAt 升序返回；hasMore 表示更早还有）。
 */
public record MessagePage(List<MessageView> messages, boolean hasMore) {
}
