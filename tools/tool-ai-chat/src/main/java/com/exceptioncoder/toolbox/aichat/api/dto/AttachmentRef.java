package com.exceptioncoder.toolbox.aichat.api.dto;

/**
 * 消息内附件引用，序列化进 ai_chat_message.attachments_json。
 *
 * @param id       附件 id
 * @param name     原始文件名
 * @param mime     MIME 类型
 * @param relPath  相对 data-dir 的存储路径，仅后端拼图用，对前端可省略
 */
public record AttachmentRef(String id, String name, String mime, String relPath) {
}
