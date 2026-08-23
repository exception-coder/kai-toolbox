package com.exceptioncoder.toolbox.treesize.domain;

/** 视频库自主扫描的本地根目录。 */
public record VideoScanRoot(String id, String path, boolean enabled, Long lastScanAt,
                            long videoCount, long totalSize, String status, String errorMessage) {
}
