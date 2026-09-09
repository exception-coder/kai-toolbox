package com.exceptioncoder.forge.quality.core;

import java.nio.file.Path;
import java.util.List;

/** Immutable input describing the project and candidate files for a quality run. */
public record ChangeSet(Path projectRoot, List<Path> files) {
    /** Normalizes the root and copies candidate files. */
    public ChangeSet {
        if (projectRoot == null) {
            throw new IllegalArgumentException("projectRoot must not be null");
        }
        projectRoot = projectRoot.toAbsolutePath().normalize();
        files = List.copyOf(files);
    }

    /** Returns a stable path relative to the project root. */
    public String relativePath(Path file) {
        return projectRoot.relativize(file.toAbsolutePath().normalize()).toString().replace('\\', '/');
    }
}
