package com.exceptioncoder.toolbox.reqpool.domain;

/**
 * 不可变需求洞察历史记录。
 *
 * @param id 记录 ID
 * @param itemId 需求条目 ID
 * @param analysisType 分析类型
 * @param promptVersion 提示词版本
 * @param sourceHash 需求事实指纹
 * @param portfolioSetHash 组合集合指纹，单条分析为空
 * @param payloadJson 已校验的洞察 JSON
 * @param evidenceTraceJson 项目知识、代码图谱、DDL 与路由查询轨迹快照
 * @param engine 执行引擎
 * @param model 模型名称，使用引擎默认模型时为空
 * @param createdAt 创建时间
 */
public record ReqInsight(
        String id,
        String itemId,
        ReqInsightType analysisType,
        String promptVersion,
        String sourceHash,
        String portfolioSetHash,
        String payloadJson,
        String evidenceTraceJson,
        String engine,
        String model,
        long createdAt
) {
}
