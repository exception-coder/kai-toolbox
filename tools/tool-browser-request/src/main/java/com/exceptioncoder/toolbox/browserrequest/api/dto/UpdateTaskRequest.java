package com.exceptioncoder.toolbox.browserrequest.api.dto;

import com.exceptioncoder.toolbox.browserrequest.domain.ParamSpec;
import com.exceptioncoder.toolbox.browserrequest.domain.StepSpec;

import java.util.List;

/** 更新 Task 请求体。不含 sessionId / recordingId（创建后不可改）。 */
public record UpdateTaskRequest(
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
