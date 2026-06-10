package com.exceptioncoder.toolbox.browserrequest.api.dto;

import com.exceptioncoder.toolbox.browserrequest.domain.FlowAction;

import java.util.List;

/**
 * 生成/重写 AI 用例脚本的请求。
 *
 * @param instruction    自然语言用例（必填）
 * @param previousSteps  上一版脚本（重写时带，让 LLM 在其基础上修正；首次为空）
 * @param failureError   上次执行的失败原因（重写时带）
 * @param failedAt       上次失败步骤下标（重写时带，-1/null 表示无）
 */
public record GenerateFlowRequest(
        String instruction,
        List<FlowAction> previousSteps,
        String failureError,
        Integer failedAt
) {}
