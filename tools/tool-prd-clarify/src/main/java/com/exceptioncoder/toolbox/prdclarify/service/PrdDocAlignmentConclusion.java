package com.exceptioncoder.toolbox.prdclarify.service;

/** 差异账本的三项独立结论及实施门禁。 */
public record PrdDocAlignmentConclusion(
        String codeFactAlignment,
        String businessDecisionCompleteness,
        String documentFiling,
        String implementationGate,
        int total,
        int verified,
        int unresolved,
        int codeFactCorrections,
        int confirmedBusinessDecisions,
        int outOfScope,
        int prdFiled,
        int tddFiled,
        String finalDocumentVersion,
        String summary
) {
    public static PrdDocAlignmentConclusion pending() {
        return new PrdDocAlignmentConclusion(
                "PENDING", "PENDING", "PENDING", "BLOCKED", 0, 0, 0,
                0, 0, 0, 0, 0, "", "尚未完成差异复核");
    }
}
