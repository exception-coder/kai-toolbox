package com.exceptioncoder.forge.quality.application;

import com.exceptioncoder.forge.quality.core.StackCapability;

import java.util.List;

/** Agent-neutral stack detection result. */
public record DetectionReport(List<String> plugins, List<StackCapability> capabilities) {
    /** Copies result collections. */
    public DetectionReport {
        plugins = List.copyOf(plugins);
        capabilities = List.copyOf(capabilities);
    }
}
