package com.exceptioncoder.toolbox.aichat.api.dto;

/**
 * 附件视图（上传响应 / 消息内展示）。
 *
 * @param id   附件 id
 * @param name 原始文件名
 * @param mime MIME 类型
 * @param url  下载/预览地址（/api/ai-chat/attachments/{id}）
 */
public record AttachmentView(String id, String name, String mime, String url) {
}
