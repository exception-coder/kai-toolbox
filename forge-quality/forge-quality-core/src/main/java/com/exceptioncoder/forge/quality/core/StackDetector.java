package com.exceptioncoder.forge.quality.core;

import java.util.List;

/** Detects project capabilities using deterministic repository evidence. */
public interface StackDetector {
    /** Returns the detector's stable identifier. */
    String id();

    /** Detects capabilities from the supplied project context. */
    List<StackCapability> detect(DetectionContext context);
}
