package com.exceptioncoder.toolbox.resume.api.dto;

import java.util.List;

/**
 * 整篇优化结果：每段一个优化建议，前端逐段 diff 采纳。
 *
 * @param sections 各段优化结果
 */
public record WholeOptimizationResponse(List<SectionResult> sections) {

    /**
     * 单段优化结果。
     *
     * @param sectionType      段类型
     * @param itemId           WORK/PROJECT 对应前端条目 id；SELF_INTRO 为 null
     * @param optimizedContent 结构化段为 JSON 字符串，自我介绍为纯文本
     * @param changeNotes      该段改动说明
     * @param highlightedSkills 该段匹配能力词
     */
    public record SectionResult(
            SectionType sectionType,
            String itemId,
            String optimizedContent,
            List<String> changeNotes,
            List<String> highlightedSkills
    ) {}
}
