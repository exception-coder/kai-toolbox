package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.service.DevCleanService;

import java.util.List;

/**
 * Outcome of a cleanup run.
 *
 * <p>{@code freedBytes} is what left the original location — since everything goes to the
 * recycle bin, the disk does not actually shrink until the bin is emptied. The UI says so.
 */
public record DevCleanExecuteResultView(
        long freedBytes,
        int deleted,
        int failed,
        List<Item> items
) {
    /** Per-recipe breakdown; {@code errors} carries the locked-file paths worth retrying later. */
    public record Item(String recipeId, String title, long freedBytes, int deleted, List<String> errors) {}

    public static DevCleanExecuteResultView from(DevCleanService.ExecutionReport report) {
        return new DevCleanExecuteResultView(
                report.freedBytes(),
                report.deleted(),
                report.failed(),
                report.items().stream()
                        .map(o -> new Item(o.recipe().id(), o.recipe().title(),
                                o.freedBytes(), o.deleted(), o.errors()))
                        .toList());
    }
}
