package com.exceptioncoder.toolbox.prdclarify.api.dto;

/**
 * 粘贴/上传图片附件的落盘结果。
 *
 * @param id   附件 ID（落盘目录名，也是取回图片的唯一凭证）
 * @param name 原始文件名（已做路径穿越/非法字符清洗）
 * @param mime 图片 MIME 类型
 * @param url  可直接用于 {@code <img src>} 的相对地址（{@code GET /api/prd-clarify/attachments/image/{id}}）
 */
public record ImageAttachmentView(String id, String name, String mime, String url) {
}
