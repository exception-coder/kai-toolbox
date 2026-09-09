package com.exceptioncoder.toolbox.projects.registry.api;

import com.exceptioncoder.toolbox.projects.registry.application.*;
import com.exceptioncoder.toolbox.projects.registry.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Project Registry 与 System Init 的 HTTP 边界，不承载证据或就绪判断。 */
@RestController
@RequestMapping("/api/project-registry")
public class ProjectRegistryController {
    private final ProjectRegistryService projects;
    private final SystemInitService initialization;
    private final SystemTaskService tasks;

    public ProjectRegistryController(ProjectRegistryService projects, SystemInitService initialization,
                                     SystemTaskService tasks) {
        this.projects = projects;
        this.initialization = initialization;
        this.tasks = tasks;
    }

    @GetMapping
    public List<RegistryProject> list() { return projects.list(); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RegistryProject register(@RequestBody RegistryProject.Metadata input) { return projects.register(input); }

    @PutMapping("/{id}")
    public RegistryProject update(@PathVariable String id, @RequestBody RegistryProject.Metadata input) {
        return projects.update(id, input);
    }

    @GetMapping("/{id}")
    public ProjectRegistryService.Detail detail(@PathVariable String id) { return projects.detail(id); }

    @PostMapping("/{id}/init")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public SystemInitRun initialize(@PathVariable String id, @RequestBody InitInput input) {
        return initialization.start(id, input.mode());
    }

    @PostMapping("/{id}/tasks")
    @ResponseStatus(HttpStatus.CREATED)
    public SystemTaskBinding createTask(@PathVariable String id, @RequestBody SystemTaskService.TaskInput input) {
        return tasks.create(id, input);
    }

    @GetMapping("/{id}/tasks/{taskId}/context")
    public Map<String, String> context(@PathVariable String id, @PathVariable String taskId) {
        return Map.of("prompt", tasks.handoff(id, taskId));
    }

    /** 显式区分首次初始化与手动画像同步。 */
    public record InitInput(/** FULL 或 SYNC。 */ String mode) { }
}
