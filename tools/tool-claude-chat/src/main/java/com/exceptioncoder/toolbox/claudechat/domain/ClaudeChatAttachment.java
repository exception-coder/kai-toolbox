package com.exceptioncoder.toolbox.claudechat.domain;

/** 已落盘会话附件的安全元数据；storagePath 仅在服务端内部使用。 */
public record ClaudeChatAttachment(String id, String sessionId, String name, String mime,
                                   long size, String storagePath, long createdAt) {
}
