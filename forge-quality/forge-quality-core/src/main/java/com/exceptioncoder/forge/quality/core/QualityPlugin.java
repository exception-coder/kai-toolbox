package com.exceptioncoder.forge.quality.core;

import java.util.List;

/** Extension point for technology-specific detectors and checkers. */
public interface QualityPlugin {
    /** Returns a globally unique plugin identifier. */
    String id();

    /** Returns stack detectors contributed by the plugin. */
    List<StackDetector> detectors();

    /** Returns quality checkers contributed by the plugin. */
    List<QualityChecker> checkers();
}
