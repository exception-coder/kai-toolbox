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

    private static final Set<String> CLAIM_TYPES = Set.of(
            "CONFIRMED_REQUIREMENT", "REJECTED_OPTION", "IMPLEMENTED_TECHNICAL_FACT",
            "PROPOSED_TECHNICAL_DECISION", "DISCUSSION_ONLY", "CONFLICT", "MISSING_DECISION");

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
            risks.add("独立复核对更新范围有不同建议（仅供审计，不覆盖主分析结论）："
                    + analysis.decision() + " / " + verification.recommendedDecision());
        }
        // 服务端只守住机器契约和引用完整性，不再用固定的“某类文档必须对应某类证据”规则
        // 代替会话引擎判断业务差异。Git 不是前置条件，复核器意见也只作为审计提示。
        boolean expectsChanges = Set.of("PRD_ONLY", "TDD_ONLY", "BOTH").contains(analysis.decision());
        boolean allClaimsInvalid = expectsChanges && !analysis.claims().isEmpty() && supportedClaims.isEmpty();
        boolean forcedUncertain = !analysis.parsed()
                || !verification.missingEvidenceIds().isEmpty() || allClaimsInvalid;
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
        List<PrdDocDiffItem> ledger = analysis.diffLedger().stream()
                .map(item -> "MATCHED".equals(item.status()) && verification.verified()
                        && verification.missingEvidenceIds().isEmpty() && verification.conflicts().isEmpty()
                        ? withStatus(item, "VERIFIED") : item)
                .toList();
        return new PrdDocChangeFinalAnalysis(decision, analysis.summary(), reasoning,
                analysis.changeCauseType(), analysis.changeCauseDetail(), ledger, evidence,
                analysis.prdPatchPlan(), analysis.tddPatchPlan(), List.copyOf(new java.util.LinkedHashSet<>(risks)),
                question, confidence);
    }

    private static PrdDocDiffItem withStatus(PrdDocDiffItem item, String status) {
        return new PrdDocDiffItem(item.id(), item.sourceDocument(), item.sourceSection(), item.currentDocument(),
                item.evidenceLevel(), item.evidenceIds(), item.actualEvidence(), item.proposedChange(),
                item.changeKind(), status);
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
