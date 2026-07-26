package com.exceptioncoder.toolbox.prdclarify.api.dto;

/**
 * 附件解析 + 落盘的合并响应：{@code text} 供拼进 rawInput 喂给 AI，{@code fileId}/{@code url}
 * 指向原始文件的落盘副本——之前这个接口只返回解析出的文本，原始 Word/PDF 文件解析完就丢了，
 * 用户回看 PRD/草稿时找不到当初提需求时上传的原始附件（见 FileAttachmentStorageService 类注释）。
 *
 * @param fileName    原始文件名
 * @param contentType 检测到的 MIME 类型
 * @param text        提取的文本（可能已截断）
 * @param truncated   是否因超出字符限制而被截断
 * @param fileId      落盘后的附件 id
 * @param url         下载原始文件的相对地址（{@code GET /api/prd-clarify/attachments/file/{fileId}}）
 */
public record AttachmentParseView(
        String fileName,
        String contentType,
        String text,
        boolean truncated,
        String fileId,
        String url
) {
}
