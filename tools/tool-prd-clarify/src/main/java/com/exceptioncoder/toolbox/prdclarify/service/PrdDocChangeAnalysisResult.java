package com.exceptioncoder.toolbox.prdclarify.service;

import java.util.List;

/** 分析器给出的事实声明、更新范围和文档修改计划。 */
public record PrdDocChangeAnalysisResult(
        String decision,
        String summary,
        String reasoning,
        String changeCauseType,
        String changeCauseDetail,
        List<PrdDocDiffItem> diffLedger,
        List<Claim> claims,
        List<String> prdPatchPlan,
        List<String> tddPatchPlan,
        List<String> risks,
        String clarificationQuestion,
        int modelConfidence,
        boolean parsed
) {
    /** 兼容不关心归因字段的既有调用；正式分析器会使用完整构造参数。 */
    public PrdDocChangeAnalysisResult(
            String decision, String summary, String reasoning, List<Claim> claims,
            List<String> prdPatchPlan, List<String> tddPatchPlan, List<String> risks,
            String clarificationQuestion, int modelConfidence, boolean parsed) {
        this(decision, summary, reasoning, "OTHER", reasoning, List.of(), claims, prdPatchPlan, tddPatchPlan,
                risks, clarificationQuestion, modelConfidence, parsed);
    }

    /** 分析器的一条事实声明，必须引用证据 ID。 */
    public record Claim(
            String type,
            String statement,
            List<String> evidenceIds,
            String documentImpact
    ) {
    }
}
