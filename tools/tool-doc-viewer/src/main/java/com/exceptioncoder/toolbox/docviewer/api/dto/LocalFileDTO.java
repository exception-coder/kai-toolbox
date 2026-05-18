package com.exceptioncoder.toolbox.docviewer.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

// 本地文件读取响应（kind: BLOB 表示可编辑文本，BINARY 表示二进制不渲染）
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LocalFileDTO {
    private String sourceId;
    private String path;
    private String kind;
    private long size;
    private String content;
    private long lastModified;
}
