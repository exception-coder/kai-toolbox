package com.exceptioncoder.toolbox.browserrequest.service;

import com.exceptioncoder.toolbox.browserrequest.api.dto.ReplayRequest;
import com.exceptioncoder.toolbox.browserrequest.config.BrowserRequestProperties;
import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import com.exceptioncoder.toolbox.browserrequest.domain.AdhocRequest;
import com.exceptioncoder.toolbox.browserrequest.domain.ExtractSpec;
import com.exceptioncoder.toolbox.browserrequest.domain.ParamSpec;
import com.exceptioncoder.toolbox.browserrequest.domain.ParameterizationSpec;
import com.exceptioncoder.toolbox.browserrequest.domain.StepResult;
import com.exceptioncoder.toolbox.browserrequest.domain.StepSpec;
import com.exceptioncoder.toolbox.browserrequest.domain.Task;
import com.exceptioncoder.toolbox.browserrequest.domain.TaskOptions;
import com.exceptioncoder.toolbox.browserrequest.domain.TaskRun;
import com.exceptioncoder.toolbox.browserrequest.domain.enums.TaskRunStatus;
import com.exceptioncoder.toolbox.browserrequest.repository.BrowserRequestTaskRepository;
import com.exceptioncoder.toolbox.browserrequest.repository.TaskRunRepository;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Task 回放执行器。
 *
 * 执行模型：
 *   1. 接 task + 用户填的 params → INSERT task_run RUNNING → 立即返回 view
 *   2. 异步线程顺序执行 steps：
 *      - 替换 parameterizations 得到最终 url/headers/body
 *      - 调 BrowserSessionManager.execute（走 Playwright APIRequestContext）
 *      - 抽取 extracts → 存入 task_run.outputs
 *      - emit SSE 'step'
 *      - 失败按 step/task 级 continueOnError 策略决定是否继续
 *   3. 收尾：UPDATE status=DONE/FAILED + emit 'run-done'/'run-failed'
 *
 * 并发：单 session 单线程顺序（Playwright worker 模型决定），不在本类做锁。
 */
@Slf4j
@Service
public class ReplayExecutor {

    private static final int RESPONSE_SAMPLE_BYTES = 8 * 1024;

    private final BrowserRequestTaskRepository taskRepo;
    private final TaskRunRepository taskRunRepo;
    private final BrowserSessionManager sessionMgr;
    private final BrowserRequestProperties props;
    private final SseEmitterRegistry sseRegistry;
    private final ObjectMapper objectMapper;
    private final ReplayOutputWriter outputWriter;

    /** 全局 step 执行线程池：每个 run 占一条线程，多 run 可并发（不同 session）。 */
    private final ExecutorService runner;

    public ReplayExecutor(BrowserRequestTaskRepository taskRepo,
                          TaskRunRepository taskRunRepo,
                          BrowserSessionManager sessionMgr,
                          BrowserRequestProperties props,
                          SseEmitterRegistry sseRegistry,
                          ObjectMapper objectMapper,
                          ReplayOutputWriter outputWriter) {
        this.taskRepo = taskRepo;
        this.taskRunRepo = taskRunRepo;
        this.sessionMgr = sessionMgr;
        this.props = props;
        this.sseRegistry = sseRegistry;
        this.objectMapper = objectMapper;
        this.outputWriter = outputWriter;
        this.runner = Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "browser-request-replay-runner");
            t.setDaemon(true);
            return t;
        });
    }

    public TaskRun replay(String taskId, ReplayRequest req) {
        Task task = taskRepo.findById(taskId)
                .orElseThrow(() -> new IllegalArgumentException("任务不存在: " + taskId));
        if (!sessionMgr.isActive(task.sessionId())) {
            throw new IllegalStateException("会话未打开: " + task.sessionId());
        }
        Map<String, Object> rawParams = req == null || req.params() == null ? Map.of() : req.params();
        Map<String, Object> mergedParams = mergeDefaults(task.params(), rawParams);

        long now = System.currentTimeMillis();
        TaskRun run = new TaskRun(
                UUID.randomUUID().toString(),
                taskId,
                TaskRunStatus.RUNNING,
                now, null,
                mergedParams,
                List.of(),
                null
        );
        taskRunRepo.insert(run);

        sseRegistry.publish("task-run:" + run.id(), "run-started", Map.of(
                "id", run.id(), "taskId", taskId,
                "status", run.status().name(), "startedAt", now,
                "stepCount", task.steps().size()
        ));

        runner.submit(() -> executeAsync(task, run, mergedParams));
        return run;
    }

    void executeAsync(Task task, TaskRun initialRun, Map<String, Object> params) {
        List<StepResult> results = new ArrayList<>();
        // outputs 持有跨 step 的变量：String 表单值 或 List<String>（来自 $.x[*] 抽取出来的数组）
        Map<String, Object> outputs = new HashMap<>();
        boolean failed = false;
        String topError = null;
        TaskOptions opts = task.options();
        // step 之间：步骤切换的延迟
        int stepMinMs = opts != null && opts.stepIntervalMs() != null
                ? Math.max(0, opts.stepIntervalMs())
                : props.getReplayStepIntervalMs();
        Integer stepMaxRaw = opts != null ? opts.stepIntervalMaxMs() : null;
        int stepMaxMs = (stepMaxRaw != null && stepMaxRaw > stepMinMs) ? stepMaxRaw : stepMinMs;
        // 迭代之间：同一 step 的 fan-out 循环之间，建议比 step 间隔更大——重复调同一接口最容易被风控
        // 未配置时回退到 step 间隔，保留旧行为
        int iterMinMs = opts != null && opts.iterationIntervalMs() != null
                ? Math.max(0, opts.iterationIntervalMs())
                : stepMinMs;
        Integer iterMaxRaw = opts != null ? opts.iterationIntervalMaxMs() : null;
        int iterMaxMs = (iterMaxRaw != null && iterMaxRaw > iterMinMs) ? iterMaxRaw : iterMinMs;
        boolean taskContinueOnError = opts != null && Boolean.TRUE.equals(opts.continueOnError());
        java.util.Random random = new java.util.Random();

        // 增量归档：先建好目录 + 初始 _meta.json（status=RUNNING），后面每次「最后一步」成功就写一个文件
        java.nio.file.Path outputDir = outputWriter.beginRun(task, initialRun);
        String outputDirStr = outputDir == null ? null : outputDir.toAbsolutePath().toString();
        int lastStepIndex = task.steps().size() - 1;
        int outputsWritten = 0;
        boolean lastStepWasIterated = false;
        // 把目录路径放进 run-started 事件——前端订阅上来立刻能看到归档位置
        if (outputDirStr != null) {
            sseRegistry.publish("task-run:" + initialRun.id(), "output-dir", Map.of(
                    "outputDir", outputDirStr));
        }

        outer:
        for (int i = 0; i < task.steps().size(); i++) {
            StepSpec step = task.steps().get(i);
            // 检测 fan-out：step 引用的某个变量在 outputs 里是数组 → 自动按数组长度循环
            IterationContext iter;
            try {
                iter = detectIteration(step, outputs, params);
            } catch (Exception e) {
                StepResult bad = new StepResult(i, null, null, step.name(),
                        null, null, null, null, Map.of(), "迭代检测失败: " + e.getMessage());
                results.add(bad);
                sseRegistry.publish("task-run:" + initialRun.id(), "step", bad);
                failed = true;
                topError = bad.error();
                break;
            }
            int totalIters = iter == null ? 1 : iter.values.size();
            if (iter != null && totalIters == 0) {
                // 空数组：发一条空跑结果方便前端看到，不算失败
                StepResult empty = new StepResult(i, null, null, step.name(),
                        null, null, null, null, Map.of(),
                        "跳过（迭代变量 «" + iter.varName + "» 是空数组）");
                results.add(empty);
                sseRegistry.publish("task-run:" + initialRun.id(), "step", empty);
                continue;
            }

            for (int j = 0; j < totalIters; j++) {
                // 迭代场景：把当前元素临时绑定到该变量名（覆盖原数组），单次执行结束清掉
                Map<String, Object> stepOutputs = outputs;
                Integer iterIdx = null, iterTotal = null;
                if (iter != null) {
                    stepOutputs = new HashMap<>(outputs);
                    stepOutputs.put(iter.varName, iter.values.get(j));
                    iterIdx = j;
                    iterTotal = totalIters;
                }

                StepResult result;
                try {
                    AdhocRequest base = step.adhoc();
                    if (base == null) {
                        throw new IllegalStateException("step adhoc 为空——task 数据损坏");
                    }
                    AdhocRequest rendered = renderStep(base, step.parameterizations(), params, stepOutputs);
                    BrowserSessionManager.ExecuteRequest exec = new BrowserSessionManager.ExecuteRequest(
                            nullToGet(rendered.method()),
                            rendered.url(),
                            rendered.headers() == null ? Map.of() : rendered.headers(),
                            rendered.body()
                    );
                    long t0 = System.currentTimeMillis();
                    BrowserSessionManager.ExecutedResponse resp = sessionMgr.execute(task.sessionId(), exec);
                    int elapsed = (int) (System.currentTimeMillis() - t0);
                    String sample = sampleResponse(resp.body());

                    // 抽取：迭代场景下每次迭代抽出来的可能不一样，简单策略是「最后一次胜出」
                    // 显示用的 displayMap 用本次迭代值（前端按 iterationIndex 分别看到）
                    Map<String, Object> rawExtracts = new LinkedHashMap<>();
                    String extractError = applyExtracts(resp.body(), step.extracts(), rawExtracts);
                    Map<String, String> displayExtracts = displayExtracts(rawExtracts);
                    if (extractError != null) {
                        result = new StepResult(i, iterIdx, iterTotal, step.name(),
                                resp.status(), elapsed, resp.finalUrl(), sample, displayExtracts, extractError);
                    } else {
                        outputs.putAll(rawExtracts);
                        result = new StepResult(i, iterIdx, iterTotal, step.name(),
                                resp.status(), elapsed, resp.finalUrl(), sample, displayExtracts, null);
                    }
                } catch (MissingParamException e) {
                    result = new StepResult(i, iterIdx, iterTotal, step.name(),
                            null, null, null, null, Map.of(), e.getMessage());
                } catch (Exception e) {
                    result = new StepResult(i, iterIdx, iterTotal, step.name(),
                            null, null, null, null, Map.of(), "执行失败: " + e.getMessage());
                }
                results.add(result);
                sseRegistry.publish("task-run:" + initialRun.id(), "step", result);

                // 增量归档：最后一步 + 成功 → 立即写一个文件（不必等整个 task 跑完）
                if (i == lastStepIndex && result.error() == null) {
                    outputWriter.writeIteration(outputDir, ++outputsWritten, result.extracted());
                }
                // 即使本次迭代失败也要记录「last step 本来是迭代结构」（_meta.json 用）
                if (i == lastStepIndex && iter != null) lastStepWasIterated = true;

                boolean stepFailed = result.error() != null;
                if (stepFailed) {
                    boolean cont = step.continueOnError() != null
                            ? step.continueOnError()
                            : taskContinueOnError;
                    if (!cont) {
                        failed = true;
                        String iterTag = iterIdx == null ? "" : " [iter " + iterIdx + "/" + iterTotal + "]";
                        topError = "step #" + i + iterTag + " «" + step.name() + "» 失败: " + result.error();
                        break outer;
                    }
                }

                // 节流：迭代间 vs step 间分别用不同区间——同 step 内的迭代是「同接口循环」最容易触发风控
                boolean isLastExec = (i == task.steps().size() - 1) && (j == totalIters - 1);
                if (!isLastExec) {
                    boolean nextIsIteration = j < totalIters - 1;  // 还有下一次迭代
                    int min = nextIsIteration ? iterMinMs : stepMinMs;
                    int max = nextIsIteration ? iterMaxMs : stepMaxMs;
                    if (max > 0) {
                        int sleep = max == min ? min : min + random.nextInt(max - min + 1);
                        try { Thread.sleep(sleep); } catch (InterruptedException ie) {
                            Thread.currentThread().interrupt();
                            failed = true;
                            topError = "回放被中断";
                            break outer;
                        }
                    }
                }
            }
        }

        long finishedAt = System.currentTimeMillis();
        TaskRunStatus finalStatus = failed ? TaskRunStatus.FAILED : TaskRunStatus.DONE;
        TaskRun done = initialRun
                .withStepResults(results)
                .withStatus(finalStatus, finishedAt, topError);
        taskRunRepo.update(done);

        // 收尾：用最终状态覆盖写 _meta.json（迭代过程中每条结果已经增量写过 0001.json/0002.json/...）
        outputWriter.finalizeRun(outputDir, task, done, outputsWritten,
                finalStatus, finishedAt, lastStepWasIterated);

        if (failed) {
            Map<String, Object> payload = new HashMap<>();
            payload.put("status", finalStatus.name());
            payload.put("abortedAtStep", results.isEmpty() ? -1 : results.size() - 1);
            payload.put("errorMessage", topError);
            payload.put("finishedAt", finishedAt);
            if (outputDirStr != null) payload.put("outputDir", outputDirStr);
            sseRegistry.publish("task-run:" + initialRun.id(), "run-failed", payload);
        } else {
            long okCount = results.stream().filter(r -> r.error() == null).count();
            long failCount = results.size() - okCount;
            Map<String, Object> payload = new HashMap<>();
            payload.put("status", finalStatus.name());
            payload.put("okSteps", okCount);
            payload.put("failedSteps", failCount);
            payload.put("finishedAt", finishedAt);
            if (outputDirStr != null) payload.put("outputDir", outputDirStr);
            sseRegistry.publish("task-run:" + initialRun.id(), "run-done", payload);
        }
        sseRegistry.complete("task-run:" + initialRun.id());
    }

    /**
     * 把 step 中的 parameterizations 应用到 url/headers/body：
     * 每条 parameterization 对应 field 内做一次字符串替换，token → ${varName} 解析后的值。
     */
    AdhocRequest renderStep(AdhocRequest base,
                            List<ParameterizationSpec> params,
                            Map<String, Object> inputs,
                            Map<String, Object> outputs) {
        if (params == null || params.isEmpty()) return base;
        String url = base.url();
        String body = base.body();
        Map<String, String> headers = base.headers() == null
                ? new LinkedHashMap<>()
                : new LinkedHashMap<>(base.headers());

        for (ParameterizationSpec p : params) {
            String value = resolveVar(p.varName(), inputs, outputs);
            String field = p.field();
            if ("url".equals(field)) {
                url = replaceOnce(url, p.token(), value, "url");
            } else if ("body".equals(field)) {
                body = replaceOnce(body, p.token(), value, "body");
            } else if ("path".equals(field)) {
                url = replaceInPath(url, p.token(), value);
            } else if (field != null && field.startsWith("query.")) {
                String key = field.substring("query.".length());
                url = replaceInQuery(url, key, p.token(), value);
            } else if (field != null && field.startsWith("header.")) {
                String key = field.substring("header.".length());
                String h = headers.entrySet().stream()
                        .filter(e -> e.getKey().equalsIgnoreCase(key))
                        .map(Map.Entry::getValue).findFirst().orElse(null);
                if (h != null) {
                    String replaced = replaceOnce(h, p.token(), value, "header." + key);
                    // 用原 key 大小写写回（如果存在多个相同 key 名忽略，保留第一个）
                    for (Map.Entry<String, String> e : headers.entrySet()) {
                        if (e.getKey().equalsIgnoreCase(key)) {
                            e.setValue(replaced);
                            break;
                        }
                    }
                }
            }
        }
        // responseSample 透传——编辑 UX 用，回放阶段不关心
        return new AdhocRequest(base.method(), url, headers, body, base.responseSample());
    }

    String resolveVar(String name, Map<String, Object> inputs, Map<String, Object> outputs) {
        if (name == null) throw new MissingParamException("变量名为空");
        // outputs 优先（同 task 内上游 step 抽出来的）；迭代场景下数组变量已被替换为单值
        Object v = outputs.containsKey(name) ? outputs.get(name) : inputs.get(name);
        if (v == null) {
            throw new MissingParamException("MISSING_PARAM: 变量 «" + name + "» 没有提供值（既没在 params 里也没被上游 step 抽到）");
        }
        if (v instanceof List<?> list) {
            throw new IllegalStateException(
                    "变量 «" + name + "» 是数组（" + list.size() + " 项），不能直接替换；"
                            + "迭代必须在同一 step 内显式触发——把它作为本 step 唯一的数组变量使用");
        }
        return String.valueOf(v);
    }

    /** step 引用的变量里有几个在 outputs 中是数组？返回唯一的那个迭代上下文；超过一个 → 抛错；没有 → null。 */
    IterationContext detectIteration(StepSpec step, Map<String, Object> outputs, Map<String, Object> inputs) {
        if (step.parameterizations() == null) return null;
        java.util.LinkedHashSet<String> arrayVars = new java.util.LinkedHashSet<>();
        for (ParameterizationSpec p : step.parameterizations()) {
            String n = p.varName();
            Object v = outputs.containsKey(n) ? outputs.get(n) : inputs.get(n);
            if (v instanceof List) arrayVars.add(n);
        }
        if (arrayVars.isEmpty()) return null;
        if (arrayVars.size() > 1) {
            throw new IllegalStateException(
                    "step «" + step.name() + "» 同时引用了多个数组变量 " + arrayVars
                            + "——当前只支持单数组隐式迭代");
        }
        String varName = arrayVars.iterator().next();
        Object v = outputs.containsKey(varName) ? outputs.get(varName) : inputs.get(varName);
        List<?> raw = (List<?>) v;
        List<String> values = new ArrayList<>(raw.size());
        for (Object item : raw) values.add(item == null ? "" : String.valueOf(item));
        return new IterationContext(varName, values);
    }

    record IterationContext(String varName, List<String> values) {}

    /** 把 outputs / 单次抽取的内部值（含 List）转成 StepResult.extracted 用的字符串视图。 */
    Map<String, String> displayExtracts(Map<String, Object> raw) {
        Map<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            Object v = e.getValue();
            if (v == null) continue;
            if (v instanceof List<?> list) {
                try { out.put(e.getKey(), objectMapper.writeValueAsString(list)); }
                catch (Exception ex) { out.put(e.getKey(), list.toString()); }
            } else {
                out.put(e.getKey(), String.valueOf(v));
            }
        }
        return out;
    }

    String replaceOnce(String text, String token, String value, String fieldLabel) {
        if (text == null) {
            throw new IllegalStateException("field «" + fieldLabel + "» 是 null，无法替换");
        }
        int i = text.indexOf(token);
        if (i < 0) {
            throw new IllegalStateException("field «" + fieldLabel + "» 中找不到 token «" + token
                    + "»——可能保存 task 时原文已变");
        }
        return text.substring(0, i) + value + text.substring(i + token.length());
    }

    String replaceInPath(String url, String token, String value) {
        int q = url.indexOf('?');
        String path = q >= 0 ? url.substring(0, q) : url;
        String tail = q >= 0 ? url.substring(q) : "";
        return replaceOnce(path, token, value, "path") + tail;
    }

    String replaceInQuery(String url, String key, String token, String value) {
        int q = url.indexOf('?');
        if (q < 0) return url;
        String base = url.substring(0, q + 1);
        String qs = url.substring(q + 1);
        int hash = qs.indexOf('#');
        String fragment = "";
        if (hash >= 0) {
            fragment = qs.substring(hash);
            qs = qs.substring(0, hash);
        }
        String[] pairs = qs.split("&");
        for (int idx = 0; idx < pairs.length; idx++) {
            int eq = pairs[idx].indexOf('=');
            String k = eq >= 0 ? pairs[idx].substring(0, eq) : pairs[idx];
            String v = eq >= 0 ? pairs[idx].substring(eq + 1) : "";
            if (k.equals(key)) {
                v = replaceOnce(v, token, value, "query." + key);
                pairs[idx] = k + "=" + v;
                break;
            }
        }
        return base + String.join("&", pairs) + fragment;
    }

    /**
     * 应用 extracts；成功填到 outputs，失败返回错误信息（让 step 失败）。
     * outputs 里数组类型保留为 {@code List<String>}（来自 $.x[*] 这种通配 path），
     * 供下游 step 隐式 fan-out；其余存为单值 String。
     */
    String applyExtracts(String responseBody, List<ExtractSpec> extracts, Map<String, Object> outputs) {
        if (extracts == null || extracts.isEmpty()) return null;
        if (responseBody == null || responseBody.isBlank()) {
            return "extract 失败：响应体为空";
        }
        for (ExtractSpec ex : extracts) {
            JsonNode node = SimpleJsonPath.eval(responseBody, ex.jsonPath(), objectMapper);
            if (node == null || node.isNull()) {
                return "extract «" + ex.name() + "» 取到 null（路径 " + ex.jsonPath() + "）";
            }
            if (node.isArray()) {
                // 数组路径（含 [*]）：保留为 List<String>，下游 step 引用此变量时自动 fan-out
                List<String> list = new ArrayList<>(node.size());
                for (JsonNode item : node) list.add(SimpleJsonPath.stringify(item));
                outputs.put(ex.name(), list);
            } else {
                outputs.put(ex.name(), node.isValueNode() ? node.asText() : node.toString());
            }
        }
        return null;
    }

    String sampleResponse(String body) {
        if (body == null) return null;
        return body.length() <= RESPONSE_SAMPLE_BYTES
                ? body
                : body.substring(0, RESPONSE_SAMPLE_BYTES) + "…";
    }

    Map<String, Object> mergeDefaults(List<ParamSpec> params, Map<String, Object> rawParams) {
        Map<String, Object> out = new LinkedHashMap<>(rawParams);
        if (params == null) return out;
        for (ParamSpec p : params) {
            if (!out.containsKey(p.name()) && p.defaultValue() != null) {
                out.put(p.name(), coerce(p.defaultValue(), p.kind()));
            }
        }
        return out;
    }

    Object coerce(String value, String kind) {
        if (kind == null) return value;
        try {
            return switch (kind) {
                case "number" -> {
                    if (value.contains(".")) yield Double.parseDouble(value);
                    yield Long.parseLong(value);
                }
                case "boolean" -> Boolean.parseBoolean(value);
                default -> value;
            };
        } catch (Exception e) {
            return value;
        }
    }

    String nullToGet(String method) {
        return method == null || method.isBlank() ? "GET" : method.toUpperCase();
    }

    public void shutdown() {
        runner.shutdown();
        try {
            if (!runner.awaitTermination(5, TimeUnit.SECONDS)) runner.shutdownNow();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            runner.shutdownNow();
        }
    }

    static class MissingParamException extends RuntimeException {
        MissingParamException(String msg) { super(msg); }
    }
}
