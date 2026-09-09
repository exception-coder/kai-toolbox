package com.exceptioncoder.forge.quality.core;

import java.util.List;
import java.util.Set;

/** Runs one focused quality rule or closely related rule family. */
public interface QualityChecker {
    /** Returns the stable gate identifier. */
    String id();

    /** Returns the high-level quality domain. */
    String domain();

    /** Returns capability IDs that enable this checker. */
    Set<String> requiredCapabilities();

    /** Checks the change set and returns structured findings. */
    List<Finding> check(ChangeSet changeSet, List<StackCapability> capabilities);
}
