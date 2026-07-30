package com.exceptioncoder.toolbox.prdclarify.service;

import java.util.List;

/** 经过证据校验、独立复核和服务端评分后的候选结果。 */
public record PrdDocChangeFinalAnalysis(
        String decision,
        String summary,
        String reasoning,
        List<String> evidence,
        List<String> prdPatchPlan,
        List<String> tddPatchPlan,
        List<String> risks,
        String clarificationQuestion,
        int confidence
) {
}
