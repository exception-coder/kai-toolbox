package com.exceptioncoder.toolbox.scheduler.api;

import com.exceptioncoder.toolbox.scheduler.domain.SchedulerModels.CronUpdateRequest;
import com.exceptioncoder.toolbox.scheduler.domain.SchedulerModels.ExecutionListResponse;
import com.exceptioncoder.toolbox.scheduler.domain.SchedulerModels.TaskListResponse;
import com.exceptioncoder.toolbox.scheduler.service.SchedulerEventPublisher;
import com.exceptioncoder.toolbox.scheduler.service.SchedulerService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

@RestController
@RequestMapping("/api/scheduler")
public class SchedulerController {
    private final SchedulerService schedulerService;
    private final SchedulerEventPublisher eventPublisher;

    public SchedulerController(SchedulerService schedulerService, SchedulerEventPublisher eventPublisher) {
        this.schedulerService = schedulerService;
        this.eventPublisher = eventPublisher;
    }

    @GetMapping("/tasks")
    public TaskListResponse listTasks() {
        return new TaskListResponse(schedulerService.listTasks());
    }

    @GetMapping("/tasks/{taskId}/executions")
    public ExecutionListResponse listExecutions(@PathVariable String taskId,
                                                @RequestParam(defaultValue = "50") int limit) {
        return new ExecutionListResponse(schedulerService.listExecutions(taskId, limit));
    }

    @PostMapping("/tasks/{taskId}/run")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, Boolean> runNow(@PathVariable String taskId) {
        schedulerService.runNow(taskId);
        return Map.of("accepted", true);
    }

    @PostMapping("/tasks/{taskId}/pause")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void pause(@PathVariable String taskId) {
        schedulerService.pause(taskId);
    }

    @PostMapping("/tasks/{taskId}/resume")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resume(@PathVariable String taskId) {
        schedulerService.resume(taskId);
    }

    @PutMapping("/tasks/{taskId}/cron")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void updateCron(@PathVariable String taskId, @RequestBody CronUpdateRequest request) {
        schedulerService.updateCron(taskId, request.cron(), request.zone());
    }

    @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events() {
        return eventPublisher.subscribe();
    }
}
