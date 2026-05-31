package com.exceptioncoder.toolbox.browserrequest.service;

import com.exceptioncoder.toolbox.browserrequest.api.dto.CreateTaskRequest;
import com.exceptioncoder.toolbox.browserrequest.api.dto.UpdateTaskRequest;
import com.exceptioncoder.toolbox.browserrequest.domain.AdhocRequest;
import com.exceptioncoder.toolbox.browserrequest.domain.HttpCall;
import com.exceptioncoder.toolbox.browserrequest.domain.ParameterizationSpec;
import com.exceptioncoder.toolbox.browserrequest.domain.StepSpec;
import com.exceptioncoder.toolbox.browserrequest.domain.Task;
import com.exceptioncoder.toolbox.browserrequest.domain.TaskOptions;
import com.exceptioncoder.toolbox.browserrequest.domain.TaskRun;
import com.exceptioncoder.toolbox.browserrequest.repository.HttpCallRepository;
import com.exceptioncoder.toolbox.browserrequest.repository.BrowserRequestTaskRepository;
import com.exceptioncoder.toolbox.browserrequest.repository.TaskRunRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Task 模型管理：创建/查询/更新/删除 + parameterization 校验 + 把 fromCall 引用副本化为 adhoc。
 */
@Slf4j
@Service
public class BrowserRequestTaskService {

    private final BrowserRequestTaskRepository taskRepo;
    private final TaskRunRepository taskRunRepo;
    private final HttpCallRepository callRepo;

    public BrowserRequestTaskService(BrowserRequestTaskRepository taskRepo,
                       TaskRunRepository taskRunRepo,
                       HttpCallRepository callRepo) {
        this.taskRepo = taskRepo;
        this.taskRunRepo = taskRunRepo;
        this.callRepo = callRepo;
    }

    public Task create(CreateTaskRequest req) {
        validateRequest(req.sessionId(), req.name(), req.steps());
        // 把每个 step 的 fromCall 引用副本化为 adhoc（避免录制被删 step 失效），并校验 parameterization
        List<StepSpec> hydratedSteps = hydrateSteps(req.steps());
        long now = System.currentTimeMillis();
        Task task = new Task(
                UUID.randomUUID().toString(),
                req.sessionId(),
                req.recordingId(),
                req.name().trim(),
                hydratedSteps,
                req.params() == null ? List.of() : req.params(),
                new TaskOptions(
                        req.stepIntervalMs(), req.stepIntervalMaxMs(),
                        req.iterationIntervalMs(), req.iterationIntervalMaxMs(),
                        req.continueOnError()),
                now, now
        );
        taskRepo.insert(task);
        log.info("[BrowserRequestTaskService] created taskId={} sessionId={} steps={}",
                task.id(), task.sessionId(), task.steps().size());
        return task;
    }

    public Task update(String taskId, UpdateTaskRequest req) {
        Task exist = taskRepo.findById(taskId)
                .orElseThrow(() -> new IllegalArgumentException("任务不存在: " + taskId));
        validateRequest(exist.sessionId(), req.name(), req.steps());
        List<StepSpec> hydrated = hydrateSteps(req.steps());
        Task next = new Task(
                exist.id(), exist.sessionId(), exist.recordingId(),
                req.name().trim(),
                hydrated,
                req.params() == null ? List.of() : req.params(),
                new TaskOptions(
                        req.stepIntervalMs(), req.stepIntervalMaxMs(),
                        req.iterationIntervalMs(), req.iterationIntervalMaxMs(),
                        req.continueOnError()),
                exist.createdAt(), System.currentTimeMillis()
        );
        taskRepo.update(next);
        return next;
    }

    public Task detail(String taskId) {
        return taskRepo.findById(taskId)
                .orElseThrow(() -> new IllegalArgumentException("任务不存在: " + taskId));
    }

    public List<Task> listBySession(String sessionId) {
        return taskRepo.findBySessionOrderByUpdatedDesc(sessionId);
    }

    public void delete(String taskId) {
        taskRunRepo.deleteByTask(taskId);
        taskRepo.deleteById(taskId);
    }

    public List<TaskRun> listRuns(String taskId, int limit) {
        int safe = Math.min(Math.max(1, limit), 200);
        return taskRunRepo.findByTaskOrderByStartedDesc(taskId, safe);
    }

    public TaskRun runDetail(String runId) {
        return taskRunRepo.findById(runId)
                .orElseThrow(() -> new IllegalArgumentException("回放记录不存在: " + runId));
    }

    // ── 内部校验 ────────────────────────────────────────────────────────

    void validateRequest(String sessionId, String name, List<StepSpec> steps) {
        if (sessionId == null || sessionId.isBlank()) throw new IllegalArgumentException("sessionId 必填");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("name 必填");
        if (steps == null || steps.isEmpty()) throw new IllegalArgumentException("steps 至少 1 个");
    }

    /** 把 fromCall 的 method/url/headers/body 写入 step.adhoc；同时校验 parameterizations。 */
    List<StepSpec> hydrateSteps(List<StepSpec> raw) {
        List<StepSpec> out = new ArrayList<>(raw.size());
        for (StepSpec s : raw) {
            AdhocRequest adhoc = s.adhoc();
            if (s.fromCallId() != null && !s.fromCallId().isBlank()) {
                Optional<HttpCall> callOpt = callRepo.findByIds(List.of(s.fromCallId())).stream().findFirst();
                if (callOpt.isEmpty()) {
                    if (adhoc == null) {
                        throw new IllegalArgumentException(
                                "fromCallId=" + s.fromCallId() + " 对应的录制调用不存在，且未提供 adhoc 兜底");
                    }
                    // 用提交的 adhoc 兜底（前端可能预先填了）
                } else {
                    HttpCall c = callOpt.get();
                    // 把响应体也快照进 adhoc——编辑 task 时不再依赖 recording 是否还在
                    adhoc = new AdhocRequest(c.method(), c.url(), c.requestHeaders(),
                            c.requestBody(), c.responseBody());
                }
            }
            if (adhoc == null) {
                throw new IllegalArgumentException("step «" + s.name() + "» 既没 fromCallId 也没 adhoc");
            }
            validateParameterizations(s.parameterizations(), adhoc);
            out.add(new StepSpec(s.name(), s.fromCallId(), adhoc,
                    s.parameterizations(), s.extracts(), s.continueOnError()));
        }
        return out;
    }

    void validateParameterizations(List<ParameterizationSpec> ps, AdhocRequest adhoc) {
        if (ps == null || ps.isEmpty()) return;
        for (ParameterizationSpec p : ps) {
            String source = resolveFieldText(p.field(), adhoc);
            if (source == null) {
                throw new IllegalArgumentException(
                        "field «" + p.field() + "» 在 step 中不存在或值为空，无法参数化");
            }
            int count = countOccurrences(source, p.token());
            if (count == 0) {
                throw new IllegalArgumentException(
                        "PARAMETERIZATION_TOKEN_NOT_FOUND: «" + p.token()
                                + "» 在 field «" + p.field() + "» 中找不到");
            }
            if (count > 1) {
                throw new IllegalArgumentException(
                        "PARAMETERIZATION_TOKEN_AMBIGUOUS: «" + p.token()
                                + "» 在 field «" + p.field() + "» 中出现 " + count + " 次，请缩小选区或换更独特的片段");
            }
        }
    }

    /**
     * 按 field 描述符取出原文片段：
     *   url        → 整 URL
     *   path       → URL 的 path 段
     *   query.KEY  → 某 query 参数 value
     *   header.KEY → 某 header value
     *   body       → 请求体
     */
    String resolveFieldText(String field, AdhocRequest adhoc) {
        if (field == null) return null;
        if ("url".equals(field)) return adhoc.url();
        if ("body".equals(field)) return adhoc.body();
        if ("path".equals(field)) {
            try {
                URI u = URI.create(adhoc.url());
                return u.getRawPath();
            } catch (Exception e) {
                return null;
            }
        }
        if (field.startsWith("query.")) {
            String key = field.substring("query.".length());
            return extractQueryValue(adhoc.url(), key);
        }
        if (field.startsWith("header.")) {
            String key = field.substring("header.".length());
            if (adhoc.headers() == null) return null;
            // 大小写不敏感匹配
            for (Map.Entry<String, String> e : adhoc.headers().entrySet()) {
                if (e.getKey().equalsIgnoreCase(key)) return e.getValue();
            }
            return null;
        }
        return null;
    }

    String extractQueryValue(String url, String key) {
        if (url == null) return null;
        int q = url.indexOf('?');
        if (q < 0) return null;
        String qs = url.substring(q + 1);
        int hash = qs.indexOf('#');
        if (hash >= 0) qs = qs.substring(0, hash);
        for (String pair : qs.split("&")) {
            int eq = pair.indexOf('=');
            String k = eq >= 0 ? pair.substring(0, eq) : pair;
            String v = eq >= 0 ? pair.substring(eq + 1) : "";
            if (k.equals(key)) return v;
        }
        return null;
    }

    static int countOccurrences(String text, String token) {
        if (text == null || token == null || token.isEmpty()) return 0;
        int cnt = 0, from = 0;
        while (true) {
            int i = text.indexOf(token, from);
            if (i < 0) return cnt;
            cnt++;
            from = i + token.length();
        }
    }

}
