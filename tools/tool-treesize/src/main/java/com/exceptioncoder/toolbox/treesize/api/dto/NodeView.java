package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.domain.FileNode;

public record NodeView(
        String path,
        String name,
        boolean dir,
        long size,
        long fileCount,
        long dirCount,
        int depth
) {
    public static NodeView from(FileNode n) {
        return new NodeView(
                n.getPath(),
                n.getName(),
                n.isDir(),
                n.getSize(),
                n.getFileCount(),
                n.getDirCount(),
                n.getDepth()
        );
    }
}
