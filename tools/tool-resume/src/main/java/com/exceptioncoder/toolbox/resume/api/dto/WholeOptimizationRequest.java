package com.exceptioncoder.toolbox.resume.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 整篇优化请求体。一次把整张简历喂给 LLM 做跨段统筹优化。
 *
 * @param resumeJson      整张简历 ResumeData 的 JSON 字符串（前端当前编辑内容）
 * @param targetRole      目标岗位
 * @param experienceYears 工作年限（整数年），可空
 * @param seniorityLevel  岗位级别，可空
 * @param model           指定模型，可空；为空则用 engine 对应配置默认
 * @param engine          引擎选择：fast（快速，默认）/ quality（高质量），可空
 */
public record WholeOptimizationRequest(
        @NotBlank String resumeJson,
        @NotBlank String targetRole,
        Integer experienceYears,
        SeniorityLevel seniorityLevel,
        String model,
        String engine
) {}
