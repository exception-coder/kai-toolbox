package com.exceptioncoder.forge.quality.runtime;

/** One sanitized runtime scenario result. */
public record RuntimeVerificationResult(
        String ruleId,
        String scenarioId,
        String type,
        RuntimeStatus status,
        long durationMillis,
        String message,
        String evidence
) {
}
