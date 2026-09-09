package com.exceptioncoder.forge.quality.core;

import java.nio.file.Path;
import java.util.List;

/** Read-only input made available to stack detectors. */
public record DetectionContext(Path projectRoot, List<Path> files) {
    /** Copies the file list to keep detector input immutable. */
    public DetectionContext {
        files = List.copyOf(files);
    }
}
