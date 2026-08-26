package com.exceptioncoder.toolbox.claudechat.domain;

import java.util.List;

/** 会话正在执行时登记的待发送消息；附件引用指向已经落盘的本地文件。 */
public record QueuedChatMessage(
        String id,
        String sessionId,
        String text,
        String displayText,
        String developerInstructions,
        List<Attachment> attachments,
        long createdAt) {

    public record Attachment(String id, String name, String path, String mime) {
        public Attachment(String name, String path, String mime) {
            this(null, name, path, mime);
        }
    }
}
