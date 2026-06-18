package com.exceptioncoder.toolbox.visitoranalysis.api.dto;

import java.util.List;

/**
 * Python AgentScope sidecar 对灰区访客的分类提议（LLM 输出，未经裁决）。
 * 所有字段都当不可信入参：identity/relationship 可能越界，confidence 可能超界，
 * 由 {@code VerdictService} 校验归一化后才落库（"LLM 提议，代码裁决"）。
 *
 * @param degraded 是否触发降级（如企业数据增强不可用），用于结果可解释性
 */
public record SidecarVerdict(
        String identity,
        String relationship,
        Double confidence,
        String rationale,
        List<String> evidence,
        String model,
        boolean degraded
) {
}
