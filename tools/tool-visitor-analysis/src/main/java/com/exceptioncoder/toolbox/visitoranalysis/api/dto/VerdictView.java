package com.exceptioncoder.toolbox.visitoranalysis.api.dto;

import java.util.List;

/**
 * 落库后的判别结果视图，回给前端。decidedBy 标记是确定性规则定的还是 LLM 定的。
 * similar 是本次灰区判别时向量召回的历史相似记录（仅即时结果带，不落库；历史列表/规则命中为空）。
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
        long createdAt,
        List<SimilarRecord> similar
) {
    /** 兼容旧签名（DB 加载、规则命中等无召回场景）：similar 默认空列表。 */
    public VerdictView(long id, Long visitorId, String name, String company, String identity,
                       String relationship, double confidence, String decidedBy, String rationale,
                       String evidenceJson, String model, boolean needsReview, long createdAt) {
        this(id, visitorId, name, company, identity, relationship, confidence, decidedBy, rationale,
                evidenceJson, model, needsReview, createdAt, List.of());
    }

    /** 附上向量召回记录（灰区判别后调用），返回新实例。 */
    public VerdictView withSimilar(List<SimilarRecord> s) {
        return new VerdictView(id, visitorId, name, company, identity, relationship, confidence,
                decidedBy, rationale, evidenceJson, model, needsReview, createdAt,
                s == null ? List.of() : s);
    }
}
