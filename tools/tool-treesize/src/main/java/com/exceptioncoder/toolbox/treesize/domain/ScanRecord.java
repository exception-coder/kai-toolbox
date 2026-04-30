package com.exceptioncoder.toolbox.treesize.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ScanRecord {
    private String id;
    private String rootPath;
    private ScanStatus status;
    private long startedAt;
    private Long finishedAt;
    private long totalFiles;
    private long totalDirs;
    private long totalSize;
    private String errorMsg;
}
