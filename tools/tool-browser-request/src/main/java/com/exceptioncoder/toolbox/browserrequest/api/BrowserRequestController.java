package com.exceptioncoder.toolbox.browserrequest.api;

import com.exceptioncoder.toolbox.browserrequest.api.dto.CreateSessionRequest;
import com.exceptioncoder.toolbox.browserrequest.api.dto.CreateTaskRequest;
import com.exceptioncoder.toolbox.browserrequest.api.dto.ReplayRequest;
import com.exceptioncoder.toolbox.browserrequest.api.dto.StartRecordingRequest;
import com.exceptioncoder.toolbox.browserrequest.api.dto.UpdateTaskRequest;
import com.exceptioncoder.toolbox.browserrequest.domain.Recording;
import com.exceptioncoder.toolbox.browserrequest.domain.Task;
import com.exceptioncoder.toolbox.browserrequest.domain.TaskRun;
import com.exceptioncoder.toolbox.browserrequest.service.BrowserRequestService;
import com.exceptioncoder.toolbox.browserrequest.service.RecordingService;
import com.exceptioncoder.toolbox.browserrequest.service.ReplayExecutor;
import com.exceptioncoder.toolbox.browserrequest.service.BrowserRequestTaskService;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

/**
 * 站点录制编排 HTTP + SSE 入口。
 *
 * 端点分 4 组：
 *   - sessions/*       会话管理（沿用旧契约，行为不变）
 *   - recordings/*     录制 CRUD + SSE 实时流
 *   - tasks/*          任务 CRUD + 触发回放
 *   - task-runs/*      回放历史 + SSE 进度流
 */
@RestController
@RequestMapping("/api/browser-request")
public class BrowserRequestController {

    private final BrowserRequestService sessionSvc;
    private final RecordingService recordingSvc;
    private final BrowserRequestTaskService taskSvc;
    private final ReplayExecutor replay;
    private final SseEmitterRegistry sseRegistry;

    public BrowserRequestController(BrowserRequestService sessionSvc,
                                    RecordingService recordingSvc,
                                    BrowserRequestTaskService taskSvc,
                                    ReplayExecutor replay,
                                    SseEmitterRegistry sseRegistry) {
        this.sessionSvc = sessionSvc;
        this.recordingSvc = recordingSvc;
        this.taskSvc = taskSvc;
        this.replay = replay;
        this.sseRegistry = sseRegistry;
    }

    // ── 会话 ────────────────────────────────────────────────────────────────

    @GetMapping("/sessions")
    public List<BrowserRequestService.SessionView> listSessions() {
        return sessionSvc.list();
    }

    @PostMapping("/sessions")
    public BrowserRequestService.SessionView createSession(@Valid @RequestBody CreateSessionRequest req) {
        return sessionSvc.create(req.name(), req.url());
    }

    @PostMapping("/sessions/{id}/open")
    public BrowserRequestService.SessionView openSession(@PathVariable String id) {
        return sessionSvc.open(id);
    }

    @PostMapping("/sessions/{id}/save")
    public BrowserRequestService.SessionView saveSession(@PathVariable String id) {
        return sessionSvc.saveStorage(id);
    }

    @PostMapping("/sessions/{id}/clear")
    public BrowserRequestService.SessionView clearSession(@PathVariable String id) {
        return sessionSvc.clearStorage(id);
    }

    @PostMapping("/sessions/{id}/close")
    public BrowserRequestService.SessionView closeSession(@PathVariable String id) {
        return sessionSvc.close(id);
    }

    @DeleteMapping("/sessions/{id}")
    public void deleteSession(@PathVariable String id) {
        sessionSvc.delete(id);
    }

    // ── 录制 ────────────────────────────────────────────────────────────────

    @PostMapping("/sessions/{id}/recordings")
    public Recording startRecording(@PathVariable String id,
                                    @RequestBody(required = false) StartRecordingRequest req) {
        // req == null 时 RecordingService.start 会按字段套默认，无需在此构造空记录
        return recordingSvc.start(id, req);
    }

    @PostMapping("/recordings/{id}/stop")
    public Recording stopRecording(@PathVariable String id) {
        return recordingSvc.stop(id, RecordingService.StopReason.USER_STOP);
    }

    @GetMapping("/sessions/{id}/recordings")
    public List<Recording> listRecordings(@PathVariable String id) {
        return recordingSvc.listBySession(id);
    }

    @GetMapping("/recordings/{id}")
    public RecordingService.RecordingDetail getRecording(@PathVariable String id,
                                                         @RequestParam(defaultValue = "false") boolean withCalls,
                                                         @RequestParam(defaultValue = "0") int offset,
                                                         @RequestParam(defaultValue = "50") int limit) {
        return recordingSvc.detail(id, withCalls, offset, limit);
    }

    @DeleteMapping("/recordings/{id}")
    public void deleteRecording(@PathVariable String id) {
        recordingSvc.delete(id);
    }

    @GetMapping(path = "/recordings/{id}/events", produces = "text/event-stream")
    public SseEmitter recordingEvents(@PathVariable String id) {
        SseEmitter emitter = sseRegistry.create("recording:" + id);
        // backfill：先把 DB 里已落库的 calls 推一次，弥补「订阅前已 publish」的空窗
        // Spring SseEmitter 在 handler 就位前会把 send 排入 earlySendAttempts 队列，所以这里
        // 同步 send 是安全的——队列里的事件会在响应通道建立后一次性刷出，顺序 = send 顺序
        try {
            RecordingService.RecordingDetail detail = recordingSvc.detail(id, true, 0, Integer.MAX_VALUE);
            if (!detail.calls().isEmpty()) {
                List<java.util.Map<String, Object>> views = detail.calls().stream()
                        .map(BrowserRequestController::toStreamView)
                        .toList();
                emitter.send(SseEmitter.event().name("backfill").data(views));
            }
        } catch (Exception e) {
            // 录制不存在或其它异常 —— 不影响后续实时流，前端会自然收到 0 backfill
        }
        return emitter;
    }

    /**
     * 把 HttpCall 抽成 SSE 用的轻量视图（与 HttpRecorder.flush 推 'call' 事件时的结构一致）。
     * 不含 body：前端实时流不需要 body，body 只在 detail 接口（停止后查看）里给。
     */
    private static java.util.Map<String, Object> toStreamView(com.exceptioncoder.toolbox.browserrequest.domain.HttpCall call) {
        java.util.Map<String, Object> view = new java.util.HashMap<>();
        view.put("id", call.id());
        view.put("recordingId", call.recordingId());
        view.put("seq", call.seq());
        view.put("method", call.method());
        view.put("url", call.url());
        view.put("resourceType", call.resourceType().name());
        view.put("status", call.status());
        view.put("elapsedMs", call.elapsedMs());
        view.put("startedAt", call.startedAt());
        view.put("responseTruncated", call.responseTruncated());
        view.put("sensitive", call.sensitive());
        return view;
    }

    // ── 任务 ────────────────────────────────────────────────────────────────

    @PostMapping("/tasks")
    public Task createTask(@Valid @RequestBody CreateTaskRequest req) {
        return taskSvc.create(req);
    }

    @GetMapping("/sessions/{id}/tasks")
    public List<Task> listTasks(@PathVariable String id) {
        return taskSvc.listBySession(id);
    }

    @GetMapping("/tasks/{id}")
    public Task getTask(@PathVariable String id) {
        return taskSvc.detail(id);
    }

    @PutMapping("/tasks/{id}")
    public Task updateTask(@PathVariable String id, @Valid @RequestBody UpdateTaskRequest req) {
        return taskSvc.update(id, req);
    }

    @DeleteMapping("/tasks/{id}")
    public void deleteTask(@PathVariable String id) {
        taskSvc.delete(id);
    }

    // ── 回放 ────────────────────────────────────────────────────────────────

    @PostMapping("/tasks/{id}/replay")
    public TaskRun replay(@PathVariable String id, @RequestBody(required = false) ReplayRequest req) {
        return replay.replay(id, req == null ? new ReplayRequest(java.util.Map.of()) : req);
    }

    @GetMapping(path = "/task-runs/{id}/events", produces = "text/event-stream")
    public SseEmitter replayEvents(@PathVariable String id) {
        return sseRegistry.create("task-run:" + id);
    }

    @GetMapping("/tasks/{id}/runs")
    public List<TaskRun> listRuns(@PathVariable String id,
                                  @RequestParam(defaultValue = "50") int limit) {
        return taskSvc.listRuns(id, limit);
    }

    @GetMapping("/task-runs/{id}")
    public TaskRun getRun(@PathVariable String id) {
        return taskSvc.runDetail(id);
    }
}
