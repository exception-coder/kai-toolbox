package com.exceptioncoder.toolbox.prdclarify.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PrdDocChangeConfidencePolicyTest {

    private final PrdDocChangeConfidencePolicy policy = new PrdDocChangeConfidencePolicy();

    @Test
    void forcesUncertainWhenPrdDecisionHasNoConfirmedUserEvidence() {
        PrdDocChangeEvidenceBundle bundle = bundle(List.of(
                new PrdDocChangeEvidenceBundle.EvidenceItem(
                        "GIT-0001", "GIT_CHANGE", "代码变化", "diff", false)));
        PrdDocChangeAnalysisResult analysis = new PrdDocChangeAnalysisResult(
                "BOTH", "范围变化", "代码有变化",
                List.of(new PrdDocChangeAnalysisResult.Claim(
                        "IMPLEMENTED_TECHNICAL_FACT", "接口已修改", List.of("GIT-0001"), "BOTH")),
                List.of("范围"), List.of("接口"), List.of(), "", 90, true);
        PrdDocChangeVerificationResult verification = new PrdDocChangeVerificationResult(
                true, "BOTH", List.of(), List.of(), List.of(), 5, List.of());

        PrdDocChangeFinalAnalysis result = policy.evaluate(bundle, analysis, verification);

        assertThat(result.decision()).isEqualTo("UNCERTAIN");
        assertThat(result.confidence()).isLessThanOrEqualTo(45);
        assertThat(result.risks()).anyMatch(item -> item.contains("缺少用户确认"));
    }

    @Test
    void removesClaimsThatReferenceUnknownEvidence() {
        PrdDocChangeEvidenceBundle bundle = bundle(List.of(
                new PrdDocChangeEvidenceBundle.EvidenceItem(
                        "GIT-0001", "GIT_CHANGE", "代码变化", "diff", false)));
        PrdDocChangeAnalysisResult analysis = new PrdDocChangeAnalysisResult(
                "TDD_ONLY", "技术变化", "实现已调整",
                List.of(new PrdDocChangeAnalysisResult.Claim(
                        "IMPLEMENTED_TECHNICAL_FACT", "不存在的证据", List.of("GIT-9999"), "TDD")),
                List.of(), List.of("接口"), List.of(), "", 80, true);
        PrdDocChangeVerificationResult verification = new PrdDocChangeVerificationResult(
                true, "TDD_ONLY", List.of(), List.of(), List.of(), 0, List.of());

        PrdDocChangeFinalAnalysis result = policy.evaluate(bundle, analysis, verification);

        assertThat(result.decision()).isEqualTo("UNCERTAIN");
        assertThat(result.evidence()).isEmpty();
        assertThat(result.risks()).anyMatch(item -> item.contains("缺少有效证据"));
    }

    @Test
    void forcesUncertainWhenAnalyzerAndVerifierDisagree() {
        PrdDocChangeEvidenceBundle bundle = bundle(List.of(
                new PrdDocChangeEvidenceBundle.EvidenceItem(
                        "GIT-0001", "GIT_CHANGE", "代码变化", "diff", false)));
        PrdDocChangeAnalysisResult analysis = new PrdDocChangeAnalysisResult(
                "TDD_ONLY", "技术变化", "实现已调整",
                List.of(new PrdDocChangeAnalysisResult.Claim(
                        "IMPLEMENTED_TECHNICAL_FACT", "接口已修改", List.of("GIT-0001"), "TDD")),
                List.of(), List.of("接口"), List.of(), "", 90, true);
        PrdDocChangeVerificationResult verification = new PrdDocChangeVerificationResult(
                true, "NONE", List.of(), List.of(), List.of(), 0, List.of());

        PrdDocChangeFinalAnalysis result = policy.evaluate(bundle, analysis, verification);

        assertThat(result.decision()).isEqualTo("UNCERTAIN");
        assertThat(result.risks()).anyMatch(item -> item.contains("判断不一致"));
    }

    @Test
    void allowsTddUpdateFromConfirmedConversationBeforeCodeExists() {
        PrdDocChangeEvidenceBundle bundle = bundle(List.of(
                new PrdDocChangeEvidenceBundle.EvidenceItem(
                        "CONV-0001", "USER_MESSAGE", "用户补充", "确认需要按价格类型分别计税", false)));
        PrdDocChangeAnalysisResult analysis = new PrdDocChangeAnalysisResult(
                "BOTH", "需求和技术设计需要补充", "用户确认了尚未编码的新规则",
                List.of(
                        new PrdDocChangeAnalysisResult.Claim(
                                "CONFIRMED_REQUIREMENT", "不同价格类型分别计税", List.of("CONV-0001"), "PRD"),
                        new PrdDocChangeAnalysisResult.Claim(
                                "PROPOSED_TECHNICAL_DECISION", "数据模型需区分价格类型", List.of("CONV-0001"), "TDD")),
                List.of("计税规则"), List.of("数据模型"), List.of(), "", 90, true);
        PrdDocChangeVerificationResult verification = new PrdDocChangeVerificationResult(
                true, "BOTH", List.of(), List.of(), List.of(), 5, List.of());

        PrdDocChangeFinalAnalysis result = policy.evaluate(bundle, analysis, verification);

        assertThat(result.decision()).isEqualTo("BOTH");
        assertThat(result.risks()).noneMatch(item -> item.contains("缺少 Git"));
    }

    private PrdDocChangeEvidenceBundle bundle(List<PrdDocChangeEvidenceBundle.EvidenceItem> evidence) {
        return new PrdDocChangeEvidenceBundle(
                "需求", "", "", "", "", "p", "t", evidence, List.of(), null);
    }
}
