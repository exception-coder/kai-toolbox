package com.exceptioncoder.toolbox.foreconsult.api.dto;

/**
 * 咨询附件上传结果。name/path 供交给悬浮会话（引擎按绝对路径 Read）；mime/size 供前端展示。
 *
 * @param name 原始文件名
 * @param path 落盘后的绝对路径（引擎用 Read 工具读取）
 * @param mime 内容类型（可为 null）
 * @param size 字节数
 */
public record ConsultAttachmentView(
        String name,
        String path,
        String mime,
        long size
) {
}
