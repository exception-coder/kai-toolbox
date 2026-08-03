package com.exceptioncoder.toolbox.prdclarify.service;

import java.util.List;

/** 经过证据校验、独立复核和服务端评分后的候选结果。 */
public record PrdDocChangeFinalAnalysis(
        String decision,
        String summary,
        String reasoning,
        String changeCauseType,
        String changeCauseDetail,
        List<PrdDocDiffItem> diffLedger,
        List<String> evidence,
        List<String> prdPatchPlan,
        List<String> tddPatchPlan,
        List<String> risks,
        String clarificationQuestion,
        int confidence
) {
    /** 兼容既有测试和扩展点；正式分析链会传入 AI 的独立归因。 */
    public PrdDocChangeFinalAnalysis(
            String decision, String summary, String reasoning, List<String> evidence,
            List<String> prdPatchPlan, List<String> tddPatchPlan, List<String> risks,
            String clarificationQuestion, int confidence) {
        this(decision, summary, reasoning, "OTHER", reasoning, List.of(), evidence, prdPatchPlan, tddPatchPlan,
                risks, clarificationQuestion, confidence);
    }
}
