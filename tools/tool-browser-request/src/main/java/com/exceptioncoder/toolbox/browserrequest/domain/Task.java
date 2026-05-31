package com.exceptioncoder.toolbox.browserrequest.domain;

import java.util.List;

/**
 * 编排好的可回放任务。steps/params/options 在 DB 中以 JSON 文本存。
 *
 * recordingId 可空：adhoc 创建 / 录制被删除后置 NULL。
 */
public record Task(
        String id,
        String sessionId,
        String recordingId,
        String name,
        List<StepSpec> steps,
        List<ParamSpec> params,
        TaskOptions options,
        long createdAt,
        long updatedAt
) {
}
