package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.service.DevCleanService;

import java.util.List;

/**
 * A cleanup recipe plus what was measured for it on this machine.
 *
 * @param size       reclaimable bytes; for {@code ADVISORY} entries this is what the manual
 *                   command would target, not something this tool will delete
 * @param itemCount  number of files/directories that would be moved to the recycle bin
 * @param available  whether the recipe's directories exist here — {@code false} means "not
 *                   installed on this machine", which is different from "already clean"
 *                   ({@code available} with {@code itemCount == 0})
 */
public record DevCleanRecipeView(
        String id,
        String group,
        String title,
        String kind,
        String safety,
        long size,
        int itemCount,
        boolean available,
        String note,
        String advisoryCommand,
        List<String> samplePaths
) {
    public static DevCleanRecipeView from(DevCleanService.RecipeReport report) {
        return new DevCleanRecipeView(
                report.recipe().id(),
                report.recipe().group(),
                report.recipe().title(),
                report.recipe().kind().name(),
                report.recipe().safety().name(),
                report.size(),
                report.itemCount(),
                report.available(),
                report.recipe().note(),
                report.recipe().advisoryCommand(),
                report.samplePaths());
    }
}
