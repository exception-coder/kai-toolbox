package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.service.DevCleanEntryQueryService;

import java.util.List;

/**
 * Bounded file-system snapshot used to review one cleanup recipe.
 *
 * @param recipeId catalog recipe identifier
 * @param entries returned entries
 * @param totalCount total number of current work items
 * @param returnedCount number of returned entries
 * @param truncated whether more entries exist
 * @param retainedEntries explicitly retained version entries
 * @param retainedCount total number of retained entries
 * @param retainedTruncated whether more retained entries exist
 */
public record DevCleanEntriesView(
        String recipeId,
        List<EntryView> entries,
        int totalCount,
        int returnedCount,
        boolean truncated,
        List<EntryView> retainedEntries,
        int retainedCount,
        boolean retainedTruncated
) {
    public static DevCleanEntriesView from(DevCleanEntryQueryService.EntryReport report) {
        return new DevCleanEntriesView(
                report.recipeId(),
                report.entries().stream().map(EntryView::from).toList(),
                report.totalCount(),
                report.returnedCount(),
                report.truncated(),
                report.retainedEntries().stream().map(EntryView::from).toList(),
                report.retainedCount(),
                report.retainedTruncated()
        );
    }

    /**
     * One concrete file or directory covered by the recipe.
     *
     * @param path absolute local path
     * @param name display name
     * @param directory whether the entry is a directory
     * @param size estimated bytes
     */
    public record EntryView(String path, String name, boolean directory, long size) {
        private static EntryView from(DevCleanEntryQueryService.Entry entry) {
            return new EntryView(entry.path(), entry.name(), entry.directory(), entry.size());
        }
    }
}
