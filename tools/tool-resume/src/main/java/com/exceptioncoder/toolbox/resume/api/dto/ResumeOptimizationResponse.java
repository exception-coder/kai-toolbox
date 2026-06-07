package com.exceptioncoder.toolbox.resume.api.dto;

import java.util.List;

/**
 * 简历优化结果。字段与前端 optimize/types.ts 的 OptimizationResult 对齐。
 *
 * <p>仅同步接口 {@code POST /api/v1/resume/optimize} 返回本结构（后端解析 LLM 的 JSON 输出）。
 * 流式接口直接把 LLM 文本切片透传，由前端 resultParser 解析，不经过本 DTO。
 *
 * @param optimizedContent 优化后内容：结构化段为 JSON 字符串，自我介绍为纯文本
 * @param changeNotes      关键改动说明
 * @param highlightedSkills 与目标岗位匹配的核心能力词
 * @param tokenUsage       token 统计，可空
 */
public record ResumeOptimizationResponse(
        String optimizedContent,
        List<String> changeNotes,
        List<String> highlightedSkills,
        TokenUsage tokenUsage
) {
    /** token 用量统计，对应 LLM 响应元数据。 */
    public record TokenUsage(Integer promptTokens, Integer completionTokens, Integer totalTokens) {}
}
