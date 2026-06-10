package com.exceptioncoder.toolbox.browserrequest.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * 一次 AI 用例执行的确定性结果。断言步骤（assert）的成败即"代码裁决"——LLM 不参与判定成功与否。
 *
 * @param ok        是否全部步骤通过
 * @param failedAt  首个失败步骤下标（全通过为 -1）
 * @param results   每步执行结果
 * @param snapshot  失败时的页面现场（供 LLM 看现场重写；全通过为 null）
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record FlowRunResult(
        boolean ok,
        int failedAt,
        List<StepOutcome> results,
        Snapshot snapshot
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record StepOutcome(int index, String type, boolean ok, String error, String detail) {}

    /** 页面现场：用于失败后让 LLM 基于真实 DOM 重写选择器。html 为去脚本/样式后截断的 body 内容。 */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Snapshot(String url, String title, String html) {}
}
