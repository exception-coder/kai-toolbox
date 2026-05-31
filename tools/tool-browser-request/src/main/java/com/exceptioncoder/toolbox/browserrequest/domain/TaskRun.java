package com.exceptioncoder.toolbox.browserrequest.domain;

import com.exceptioncoder.toolbox.browserrequest.domain.enums.TaskRunStatus;

import java.util.List;
import java.util.Map;

/**
 * 单次回放历史。inputs/stepResults 在 DB 中以 JSON 文本存。
 *
 * 状态机：RUNNING → DONE / FAILED / CANCELLED。
 */
public record TaskRun(
        String id,
        String taskId,
        TaskRunStatus status,
        long startedAt,
        Long finishedAt,
        Map<String, Object> inputs,
        List<StepResult> stepResults,
        String errorMessage
) {
    public TaskRun withStatus(TaskRunStatus next, Long finishedAt, String errorMessage) {
        return new TaskRun(id, taskId, next, startedAt, finishedAt, inputs, stepResults, errorMessage);
    }

    public TaskRun withStepResults(List<StepResult> next) {
        return new TaskRun(id, taskId, status, startedAt, finishedAt, inputs, next, errorMessage);
    }
}
