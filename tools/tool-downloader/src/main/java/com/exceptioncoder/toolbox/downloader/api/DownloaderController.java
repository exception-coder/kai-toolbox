package com.exceptioncoder.toolbox.downloader.api;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.downloader.api.dto.CreateTaskRequest;
import com.exceptioncoder.toolbox.downloader.api.dto.ProxyProbeResult;
import com.exceptioncoder.toolbox.downloader.api.dto.TaskDetailView;
import com.exceptioncoder.toolbox.downloader.api.dto.TaskView;
import com.exceptioncoder.toolbox.downloader.domain.DownloadSegment;
import com.exceptioncoder.toolbox.downloader.domain.DownloadTask;
import com.exceptioncoder.toolbox.downloader.domain.DownloadTaskRepository;
import com.exceptioncoder.toolbox.downloader.domain.HttpEngineType;
import com.exceptioncoder.toolbox.downloader.domain.TaskState;
import com.exceptioncoder.toolbox.downloader.service.ProgressBus;
import com.exceptioncoder.toolbox.downloader.service.ProxyDetector;
import com.exceptioncoder.toolbox.downloader.service.RouteProber;
import com.exceptioncoder.toolbox.downloader.service.DownloaderTaskService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/downloader")
public class DownloaderController {

    private final DownloaderTaskService DownloaderTaskService;
    private final DownloadTaskRepository repo;
    private final ProgressBus progressBus;
    private final ProxyDetector proxyDetector;
    private final SseEmitterRegistry sseRegistry;

    public DownloaderController(DownloaderTaskService DownloaderTaskService,
                                DownloadTaskRepository repo,
                                ProgressBus progressBus,
                                ProxyDetector proxyDetector,
                                SseEmitterRegistry sseRegistry) {
        this.DownloaderTaskService = DownloaderTaskService;
        this.repo = repo;
        this.progressBus = progressBus;
        this.proxyDetector = proxyDetector;
        this.sseRegistry = sseRegistry;
    }

    @PostMapping("/tasks")
    public ResponseEntity<TaskView> createTask(@RequestBody @Valid CreateTaskRequest req) {
        HttpEngineType engine = HttpEngineType.parseOrDefault(req.httpEngine());
        DownloadTask task = DownloaderTaskService.create(req.url(), req.savePath(), req.filename(), engine);
        return ResponseEntity.status(HttpStatus.CREATED).body(toView(task));
    }

    @GetMapping("/tasks")
    public List<TaskView> listTasks(@RequestParam(required = false) String state,
                                    @RequestParam(defaultValue = "50") int limit) {
        Set<TaskState> filter = parseStateFilter(state);
        return DownloaderTaskService.listAll(filter, limit).stream()
                .map(this::toView)
                .toList();
    }

    @GetMapping("/tasks/{id}")
    public TaskDetailView getTask(@PathVariable long id) {
        DownloadTask t = DownloaderTaskService.findById(id);
        List<DownloadSegment> segs = repo.listSegments(id);
        long downloaded = progressBus.currentDownloaded(id);
        if (downloaded == 0) {
            downloaded = repo.sumDownloadedBytes(id);
        }
        return TaskDetailView.of(t, segs, downloaded);
    }

    @PostMapping("/tasks/{id}/pause")
    public TaskView pauseTask(@PathVariable long id) {
        return toView(DownloaderTaskService.pause(id));
    }

    @PostMapping("/tasks/{id}/resume")
    public TaskView resumeTask(@PathVariable long id) {
        return toView(DownloaderTaskService.resume(id));
    }

    @DeleteMapping("/tasks/{id}")
    public ResponseEntity<Void> deleteTask(@PathVariable long id,
                                           @RequestParam(defaultValue = "false") boolean keepFile) {
        DownloaderTaskService.delete(id, keepFile);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/tasks/{id}/events")
    public SseEmitter subscribeEvents(@PathVariable long id) {
        // 触发 TaskNotFoundException → 404
        DownloaderTaskService.findById(id);
        return sseRegistry.create(String.valueOf(id));
    }

    @GetMapping("/proxy/detect")
    public ProxyProbeResult detectProxy() {
        return ProxyProbeResult.of(proxyDetector.detect());
    }

    // ---------- helpers ----------

    private TaskView toView(DownloadTask t) {
        long downloaded = progressBus.currentDownloaded(t.getId());
        if (downloaded == 0) downloaded = repo.sumDownloadedBytes(t.getId());
        return TaskView.of(t, downloaded, 0L, null);
    }

    private static Set<TaskState> parseStateFilter(String state) {
        if (state == null || state.isBlank()) return EnumSet.noneOf(TaskState.class);
        return Arrays.stream(state.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(s -> {
                    try { return TaskState.valueOf(s.toUpperCase()); }
                    catch (IllegalArgumentException e) { return null; }
                })
                .filter(x -> x != null)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(TaskState.class)));
    }
}
