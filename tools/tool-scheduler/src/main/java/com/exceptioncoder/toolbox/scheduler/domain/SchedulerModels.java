package com.exceptioncoder.toolbox.scheduler.domain;

import java.time.Instant;
import java.util.List;

public final class SchedulerModels {
    private SchedulerModels() {
    }

    public record TaskView(
            String id, String name, String description, String owner, String source,
            String scheduleType, String scheduleExpression, String zone, boolean enabled,
            boolean controllable, boolean running, Instant nextExecution, ExecutionView lastExecution) {
    }

    public record ExecutionView(
            String id, String taskId, String triggerSource, String status,
            Instant startTime, Instant endTime, Long durationMs, String errorSummary) {
    }

    public record TaskListResponse(List<TaskView> items) {
    }

    public record ExecutionListResponse(List<ExecutionView> items) {
    }

    public record CronUpdateRequest(String cron, String zone) {
    }
}
