package com.exceptioncoder.toolbox.aisecretary.domain;

/** 落库的一条附件元数据，关联到某条 note。文件本体在 storedPath。 */
public record Attachment(
        String id,
        String noteId,
        String fileName,
        String mimeType,
        long sizeBytes,
        String storedPath,
        long createdAt) {
}
