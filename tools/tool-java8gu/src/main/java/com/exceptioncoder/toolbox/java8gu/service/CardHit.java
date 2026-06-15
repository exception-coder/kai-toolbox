package com.exceptioncoder.toolbox.java8gu.service;

/**
 * 一条八股卡片的召回命中：全部字段来自 Qdrant 真实存储（id/分类/标题存于 payload metadata，
 * 正文为 segment 文本），由代码确定性检索得到、原样回传，不经模型转述。
 *
 * @param id            题号（如 0004）
 * @param categoryId    分类目录 id（如 08_微服务与分布式）
 * @param categoryLabel 分类中文名
 * @param title         题目标题
 * @param text          命中正文（速记 markdown）
 * @param score         余弦相似度
 */
public record CardHit(String id, String categoryId, String categoryLabel, String title, String text, double score) {
}
