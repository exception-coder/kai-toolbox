package com.exceptioncoder.toolbox.visitoranalysis.ai;

import java.util.List;

/**
 * 灰区 LLM 分类的结构化输出（LLM 提议，未经裁决）。LangChain4j 自动注入 JSON 约束并解析成本对象。
 *
 * <p>所有字段都当不可信入参：{@code identity}/{@code relationship} 可能越界、{@code confidence} 可能超界，
 * 由 {@code VerdictService} 校验归一化后才落库（"LLM 提议，代码裁决"）。
 */
public record ClassifyProposal(
        String identity,
        String relationship,
        Double confidence,
        String rationale,
        List<String> evidence
) {
}
