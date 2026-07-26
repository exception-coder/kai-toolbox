package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.service.DiskUsageAnalysisService;

import java.util.List;

/** Read-only explanation of drive usage and large per-user software data directories. */
public record DiskUsageView(
        String drive,
        long totalBytes,
        long usedBytes,
        long freeBytes,
        long measuredBytes,
        List<Item> rootItems,
        List<Item> softwareItems
) {
    public static DiskUsageView from(DiskUsageAnalysisService.Analysis analysis) {
        return new DiskUsageView(
                analysis.drive(),
                analysis.totalBytes(),
                analysis.usedBytes(),
                analysis.freeBytes(),
                analysis.measuredBytes(),
                analysis.rootItems().stream().map(Item::from).toList(),
                analysis.softwareItems().stream().map(Item::from).toList()
        );
    }

    public record Item(String name, String path, String scope, long size, boolean directory) {
        private static Item from(DiskUsageAnalysisService.UsageItem item) {
            return new Item(item.name(), item.path(), item.scope(), item.size(), item.directory());
        }
    }
}
