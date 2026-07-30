package com.exceptioncoder.toolbox.prdclarify.service;

import java.util.List;

/** 独立复核器对分析结论证据覆盖度和一致性的检查结果。 */
public record PrdDocChangeVerificationResult(
        boolean verified,
        String recommendedDecision,
        List<Integer> unsupportedClaimIndexes,
        List<String> missingEvidenceIds,
        List<String> conflicts,
        int confidenceAdjustment,
        List<String> notes
) {
}
