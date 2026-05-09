package com.exceptioncoder.toolbox.treesize.api.dto;

public record SymlinkResultView(
        String sourcePath,
        String targetPath,
        long movedBytes
) {}
