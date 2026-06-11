package com.exceptioncoder.toolbox.aisecretary.api.dto;

/** 前端展示用的附件视图（不含服务端绝对路径）。 */
public record AttachmentView(String id, String fileName, String mimeType, long sizeBytes) {
}
