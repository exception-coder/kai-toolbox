package com.exceptioncoder.toolbox.prdclarify.service;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** 校验证据引用，并按确定性规则计算最终范围和置信度。 */
@Service
public class PrdDocChangeConfidencePolicy {

    private static final Set<String> PRD_DECISIONS = Set.of("PRD_ONLY", "BOTH");
    private static final Set<String> TECHNICAL_DECISIONS = Set.of("TDD_ONLY", "BOTH");
    private static final Set<String> CLAIM_TYPES = Set.of(
            "CONFIRMED_REQUIREMENT", "REJECTED_OPTION", "IMPLEMENTED_TECHNICAL_FACT",
            "DISCUSSION_ONLY", "CONFLICT", "MISSING_DECISION");

    /** 合并分析与复核结果，生成可持久化候选。 */
    public PrdDocChangeFinalAnalysis evaluate(PrdDocChangeEvidenceBundle bundle,
                                              PrdDocChangeAnalysisResult analysis,
                                              PrdDocChangeVerificationResult verification) {
        Map<String, PrdDocChangeEvidenceBundle.EvidenceItem> evidenceById = bundle.evidence().stream()
                .collect(Collectors.toMap(PrdDocChangeEvidenceBundle.EvidenceItem::id, item -> item));
        Set<Integer> unsupportedIndexes = unsupportedIndexes(analysis, verification, evidenceById.keySet());
        List<PrdDocChangeAnalysisResult.Claim> supportedClaims = supportedClaims(analysis, unsupportedIndexes);
        List<String> risks = new ArrayList<>(analysis.risks());
        risks.addAll(bundle.warnings());
        risks.addAll(verification.notes());
        risks.addAll(verification.conflicts());
        if (!verification.missingEvidenceIds().isEmpty()) {
            risks.add("复核器发现缺失证据引用：" + String.join(",", verification.missingEvidenceIds()));
        }

        boolean decisionConflict = !verification.recommendedDecision().isBlank()
                && !analysis.decision().equals(verification.recommendedDecision());
        if (decisionConflict) {
            risks.add("分析器与复核器对更新范围判断不一致："
                    + analysis.decision() + " / " + verification.recommendedDecision());
        }
        boolean missingRequirementEvidence = PRD_DECISIONS.contains(analysis.decision())
                && !hasRequirementEvidence(supportedClaims, evidenceById);
        boolean missingTechnicalEvidence = TECHNICAL_DECISIONS.contains(analysis.decision())
                && !hasTechnicalEvidence(supportedClaims, evidenceById);
        boolean forcedUncertain = !analysis.parsed() || !verification.verified() || decisionConflict
                || !verification.conflicts().isEmpty() || !verification.missingEvidenceIds().isEmpty()
                || missingRequirementEvidence || missingTechnicalEvidence;
        if (missingRequirementEvidence) {
            risks.add("PRD 变更缺少用户确认或澄清证据");
        }
        if (missingTechnicalEvidence) {
            risks.add("TDD 变更缺少 Git 或工具结果证据");
        }
        if (!unsupportedIndexes.isEmpty()) {
            risks.add("有 " + unsupportedIndexes.size() + " 条结论缺少有效证据，已从候选证据中剔除");
        }

        String decision = forcedUncertain ? "UNCERTAIN" : analysis.decision();
        int confidence = confidence(bundle, analysis, verification, unsupportedIndexes, forcedUncertain);
        String question = decision.equals("UNCERTAIN")
                ? question(analysis, risks) : "";
        String reasoning = analysis.reasoning() + "\n复核："
                + (verification.verified() ? "通过" : "未通过")
                + (verification.notes().isEmpty() ? "" : "；" + String.join("；", verification.notes()));
        List<String> evidence = supportedClaims.stream()
                .map(claim -> "[" + claim.type() + "]["
                        + String.join(",", claim.evidenceIds()) + "] " + claim.statement())
                .toList();
        return new PrdDocChangeFinalAnalysis(decision, analysis.summary(), reasoning, evidence,
                analysis.prdPatchPlan(), analysis.tddPatchPlan(), List.copyOf(new java.util.LinkedHashSet<>(risks)),
                question, confidence);
    }

    private Set<Integer> unsupportedIndexes(PrdDocChangeAnalysisResult analysis,
                                            PrdDocChangeVerificationResult verification,
                                            Set<String> validEvidenceIds) {
        Set<Integer> unsupported = new HashSet<>(verification.unsupportedClaimIndexes());
        for (int index = 0; index < analysis.claims().size(); index++) {
            List<String> ids = analysis.claims().get(index).evidenceIds();
            if (!CLAIM_TYPES.contains(analysis.claims().get(index).type())
                    || ids.isEmpty() || ids.stream().anyMatch(id -> !validEvidenceIds.contains(id))) {
                unsupported.add(index);
            }
        }
        return unsupported;
    }

    private List<PrdDocChangeAnalysisResult.Claim> supportedClaims(PrdDocChangeAnalysisResult analysis,
                                                                   Set<Integer> unsupportedIndexes) {
        List<PrdDocChangeAnalysisResult.Claim> supported = new ArrayList<>();
        for (int index = 0; index < analysis.claims().size(); index++) {
            if (!unsupportedIndexes.contains(index)) {
                supported.add(analysis.claims().get(index));
            }
        }
        return supported;
    }

    private boolean hasRequirementEvidence(List<PrdDocChangeAnalysisResult.Claim> claims,
                                           Map<String, PrdDocChangeEvidenceBundle.EvidenceItem> evidenceById) {
        return claims.stream()
                .filter(claim -> "CONFIRMED_REQUIREMENT".equals(claim.type()))
                .flatMap(claim -> claim.evidenceIds().stream())
                .map(evidenceById::get)
                .filter(java.util.Objects::nonNull)
                .anyMatch(item -> Set.of("USER_MESSAGE", "CLARIFICATION").contains(item.type()));
    }

    private boolean hasTechnicalEvidence(List<PrdDocChangeAnalysisResult.Claim> claims,
                                         Map<String, PrdDocChangeEvidenceBundle.EvidenceItem> evidenceById) {
        return claims.stream()
                .filter(claim -> "IMPLEMENTED_TECHNICAL_FACT".equals(claim.type()))
                .flatMap(claim -> claim.evidenceIds().stream())
                .map(evidenceById::get)
                .filter(java.util.Objects::nonNull)
                .anyMatch(item -> Set.of("GIT_CHANGE", "TOOL_RESULT").contains(item.type()));
    }

    private int confidence(PrdDocChangeEvidenceBundle bundle, PrdDocChangeAnalysisResult analysis,
                           PrdDocChangeVerificationResult verification, Set<Integer> unsupported,
                           boolean forcedUncertain) {
        int score = analysis.modelConfidence() + verification.confidenceAdjustment();
        if (verification.verified() && unsupported.isEmpty()) {
            score += 5;
        }
        score -= Math.min(40, unsupported.size() * 15);
        score -= Math.min(20, verification.conflicts().size() * 10);
        score -= Math.min(20, verification.missingEvidenceIds().size() * 10);
        score -= (int) bundle.evidence().stream().filter(PrdDocChangeEvidenceBundle.EvidenceItem::truncated)
                .count() * 8;
        score -= Math.min(15, bundle.warnings().size() * 5);
        if (forcedUncertain) {
            score = Math.min(score, 45);
        }
        return Math.max(0, Math.min(100, score));
    }

    private String question(PrdDocChangeAnalysisResult analysis, List<String> risks) {
        if (analysis.clarificationQuestion() != null && !analysis.clarificationQuestion().isBlank()) {
            return analysis.clarificationQuestion();
        }
        return risks.isEmpty()
                ? "请补充这次开发最终确认并实际落地的核心变化。"
                : "请确认以下证据问题对应的最终结论：" + risks.getFirst();
    }
}
