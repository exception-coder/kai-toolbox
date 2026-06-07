package com.exceptioncoder.toolbox.resume.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 简历优化请求体。字段语义与前端 optimize/api.ts 的 OptimizeRequest 对齐。
 *
 * @param sectionType        目标段类型
 * @param originalContent    待优化原文：结构化段为 JSON 字符串，自我介绍为纯文本
 * @param targetRole         目标岗位（来自简历 basics.jobIntent）
 * @param experienceYears    工作年限（整数年），可空
 * @param seniorityLevel     岗位级别，可空；prompt 据此分档写作
 * @param otherSectionsBrief 其他段摘要，供跨段一致性参考，可空
 * @param model              指定模型，可空；为空则用 application.yml 默认
 */
public record ResumeOptimizationRequest(
        @NotNull SectionType sectionType,
        @NotBlank String originalContent,
        @NotBlank String targetRole,
        Integer experienceYears,
        SeniorityLevel seniorityLevel,
        String otherSectionsBrief,
        String model
) {}
