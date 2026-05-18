package com.exceptioncoder.toolbox.docviewer.api.dto;

import lombok.Data;

@Data
public class SaveLocalFileRequest {
    private String path;
    private String content;
    // 乐观锁：保存前期望的文件 mtime，0 表示不校验（新建）
    private long expectedLastModified;
}
