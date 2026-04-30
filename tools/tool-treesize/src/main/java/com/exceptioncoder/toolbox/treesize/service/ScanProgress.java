package com.exceptioncoder.toolbox.treesize.service;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ScanProgress {
    private long scanned;
    private long totalSize;
    private String currentPath;
}
