package com.exceptioncoder.toolbox.treesize.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileNode {
    private String scanId;
    private String parentPath;
    private String path;
    private String name;
    private boolean dir;
    private long size;
    private long fileCount;
    private long dirCount;
    private int depth;
    private Long modifiedAt;
}
