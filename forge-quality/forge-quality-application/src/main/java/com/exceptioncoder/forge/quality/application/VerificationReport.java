package com.exceptioncoder.forge.quality.application;

import com.exceptioncoder.forge.quality.core.QualityReport;
import com.exceptioncoder.forge.quality.runtime.RuntimeVerificationReport;

import java.util.List;

/** Agent-facing report with strictly separated static and runtime phases. */
public record VerificationReport(
        String status,
        String staticStatus,
        String runtimeStatus,
        QualityReport staticVerification,
        RuntimeVerificationReport runtimeVerification,
        List<VerificationIssue> issues
) {
    /** Copies normalized issues to keep output immutable. */
    public VerificationReport {
        issues = List.copyOf(issues);
    }
}
