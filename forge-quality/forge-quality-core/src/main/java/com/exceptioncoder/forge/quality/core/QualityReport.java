package com.exceptioncoder.forge.quality.core;

import java.time.Instant;
import java.util.List;

/** Complete deterministic output of a quality run. */
public record QualityReport(
        GateStatus status,
        Instant generatedAt,
        long durationMillis,
        List<String> plugins,
        List<StackCapability> capabilities,
        List<String> executedCheckers,
        List<Finding> findings
) {
    /** Copies all collections to preserve report integrity. */
    public QualityReport {
        plugins = List.copyOf(plugins);
        capabilities = List.copyOf(capabilities);
        executedCheckers = List.copyOf(executedCheckers);
        findings = List.copyOf(findings);
    }
}
