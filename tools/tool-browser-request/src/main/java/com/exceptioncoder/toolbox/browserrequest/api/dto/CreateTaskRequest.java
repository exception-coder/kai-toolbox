package com.exceptioncoder.toolbox.browserrequest.api.dto;

import com.exceptioncoder.toolbox.browserrequest.domain.ParamSpec;
import com.exceptioncoder.toolbox.browserrequest.domain.StepSpec;

import java.util.List;

/**
 * 创建 Task 请求体。stepIntervalMs / continueOnError 为 task 级配置，
 * 缺省时分别使用 properties 默认值 和 false。
 */
public record CreateTaskRequest(
        String sessionId,
        String recordingId,
        String name,
        List<StepSpec> steps,
        List<ParamSpec> params,
        Integer stepIntervalMs,
        Integer stepIntervalMaxMs,
        Integer iterationIntervalMs,
        Integer iterationIntervalMaxMs,
        Boolean continueOnError
) {
}
