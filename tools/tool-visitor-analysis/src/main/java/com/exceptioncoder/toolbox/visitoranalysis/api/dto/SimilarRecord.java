package com.exceptioncoder.toolbox.visitoranalysis.api.dto;

/**
 * 向量召回的一条历史相似记录。sidecar 用作灰区 LLM 判别的参考上下文，并随判别结果回传前端展示。
 *
 * @param company      相似记录的公司名
 * @param identity     该历史记录的身份（仅历史访客有；客户库记录为空）
 * @param relationship 该历史记录的关系（同上）
 * @param score        与当前访客的余弦相似度（0~1），即「可信度」
 * @param source       来源：customer(客户参照库) / visitor(已判别历史访客)
 * @param confidence   该历史访客当时的判别置信度（仅 source=visitor 有意义）
 */
public record SimilarRecord(
        String company,
        String identity,
        String relationship,
        double score,
        String source,
        Double confidence
) {
}
