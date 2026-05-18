package com.exceptioncoder.toolbox.docviewer.repository.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

// 本地 markdown 目录源：仅存根目录绝对路径，文件本身直接读磁盘
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LocalDocSource {
    private String id;
    private String alias;
    private String rootPath;
    private long lastVisitedAt;
    private long createdAt;
}
