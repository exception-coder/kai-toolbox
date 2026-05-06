package com.exceptioncoder.toolbox.flatten.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FlattenScan {
    private String id;
    private String sourcePath;
    private String targetPath;
    private FlattenStatus status;
    private long startedAt;
    private Long finishedAt;
    private long totalFiles;
    private long totalSize;
    private long duplicateGroups;
    private long duplicateFiles;
    private long duplicateSize;
    private long filesToMove;
    private long movedFiles;
    private String errorMsg;
}
