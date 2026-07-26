package com.exceptioncoder.toolbox.treesize.domain;

import lombok.Builder;

import java.util.List;

/**
 * One entry in the dev-machine cleanup catalog: a known-in-advance disk hog on a Windows
 * development box, with its paths, its safety class and what we are allowed to do to it.
 *
 * <p>Unlike {@link CleanupCandidate} — which is <em>inferred</em> from a finished scan by
 * running regexes over {@code treesize_node} — a recipe is <em>declared</em>. The safety
 * rating is human knowledge, not a guess from the path shape, and no scan is required to
 * act on it.
 *
 * <p>Recipes are compile-time constants in {@code DevCleanCatalog}. The API never accepts a
 * path from the client, only a recipe id — so the set of directories this feature can ever
 * touch is fixed at build time and reviewable in one file.
 *
 * @param targets path templates, {@code %USERPROFILE%}-style env placeholders plus optional
 *                {@code *} segments (e.g. {@code %LOCALAPPDATA%\Google\Chrome\User Data\*\Cache})
 * @param keepLatest for {@link RecipeKind#VERSIONED_DIR}, how many versions per name survive
 * @param advisoryCommand for {@link RecipeKind#ADVISORY}, the command shown to the user
 */
@Builder
public record CleanupRecipe(
        String id,
        String group,
        String title,
        RecipeKind kind,
        CleanupSafety safety,
        List<String> targets,
        int keepLatest,
        String note,
        String advisoryCommand
) {
    public boolean advisory() {
        return kind == RecipeKind.ADVISORY;
    }
}
