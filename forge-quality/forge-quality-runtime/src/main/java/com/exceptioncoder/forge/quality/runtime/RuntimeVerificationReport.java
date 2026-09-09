package com.exceptioncoder.forge.quality.runtime;

import java.time.Instant;
import java.util.List;

/** Aggregate report for project runtime scenarios. */
public record RuntimeVerificationReport(
        RuntimeStatus status,
        Instant generatedAt,
        long durationMillis,
        List<String> executedVerifiers,
        List<RuntimeVerificationResult> results
) {
    /** Copies collections to preserve report integrity. */
    public RuntimeVerificationReport {
        executedVerifiers = List.copyOf(executedVerifiers);
        results = List.copyOf(results);
    }
}
