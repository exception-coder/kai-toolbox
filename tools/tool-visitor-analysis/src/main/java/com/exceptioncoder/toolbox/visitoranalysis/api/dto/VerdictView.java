package com.exceptioncoder.toolbox.visitoranalysis.api.dto;

/**
 * 落库后的判别结果视图，回给前端。decidedBy 标记是确定性规则定的还是 LLM 定的。
 */
public record VerdictView(
        long id,
        Long visitorId,
        String name,
        String company,
        String identity,
        String relationship,
        double confidence,
        String decidedBy,
        String rationale,
        String evidenceJson,
        String model,
        boolean needsReview,
        long createdAt
) {
}
