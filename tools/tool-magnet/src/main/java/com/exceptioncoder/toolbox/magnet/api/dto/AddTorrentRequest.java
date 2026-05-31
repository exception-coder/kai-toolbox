package com.exceptioncoder.toolbox.magnet.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 上传 .torrent 文件用。content 是 base64 编码的 torrent 字节。
 * 选择 base64 而不是 multipart：避免 Spring multipart 配置 + 大多数 .torrent <500KB 编码后仍很小。
 */
public record AddTorrentRequest(
        @NotBlank(message = "torrent base64 内容必填") String contentBase64,
        String savePath
) {}
