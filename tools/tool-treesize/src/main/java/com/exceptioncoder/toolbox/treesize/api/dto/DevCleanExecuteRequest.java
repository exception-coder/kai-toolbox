package com.exceptioncoder.toolbox.treesize.api.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;

/**
 * The only thing a client may send to the cleanup executor: which recipes to run.
 *
 * <p>There is intentionally no path field. Accepting a path would turn this endpoint into an
 * arbitrary-directory deleter; with ids only, the reachable set of directories is fixed by
 * {@code DevCleanCatalog} at build time.
 */
public record DevCleanExecuteRequest(
        @NotEmpty(message = "未选择任何清理项")
        List<String> recipeIds
) {}
