package com.exceptioncoder.toolbox.treesize.domain;

/**
 * What a {@link CleanupRecipe} does to its resolved targets.
 *
 * <p>Deliberately small and closed: every kind maps to one deterministic code path in
 * {@code DevCleanService}. There is no "run this shell string" kind — anything that needs a
 * real command ({@code docker system prune}, {@code pnpm store prune}, WSL vhdx compaction)
 * is {@link #ADVISORY}: we measure and explain it, the user runs it.
 */
public enum RecipeKind {

    /** Delete the children of each target directory, keep the directory itself. */
    DIR_CONTENTS,

    /** Delete each target directory outright. */
    DIR,

    /**
     * Target is a container of {@code <name>-<version>} sibling directories (VS Code
     * extensions being the canonical case). Keep the newest {@code keepLatest} per name,
     * delete the rest.
     */
    VERSIONED_DIR,

    /** Nothing is deleted. We only report the measured size and the command to run by hand. */
    ADVISORY
}
