package com.exceptioncoder.toolbox.browserrequest.service;

import com.exceptioncoder.toolbox.browserrequest.api.dto.ExecuteRequestBody;
import com.exceptioncoder.toolbox.browserrequest.api.dto.PipelineDtos;
import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import com.exceptioncoder.toolbox.browserrequest.domain.Pipeline;
import com.exceptioncoder.toolbox.browserrequest.domain.PipelineRun;
import com.exceptioncoder.toolbox.browserrequest.domain.SavedRequest;
import com.exceptioncoder.toolbox.browserrequest.repository.BrowserVarRepository;
import com.exceptioncoder.toolbox.browserrequest.repository.PipelineRunRepository;
import com.exceptioncoder.toolbox.browserrequest.repository.SavedRequestRepository;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Pipeline 执行引擎。每次运行：
 *   1. 加载 session vars，准备瞬态 chain vars Map<String, JsonNode>
 *   2. 串行跑每个 step，single → 1 次 execute，foreach → N 次 execute
 *   3. 每个 step 的 outputs 用 SimpleJsonPath 提取，写入 chain vars；persist=true 还会 upsert session vars
 *   4. 失败策略：默认失败继续但完整登记；step.continueOnError=false 时中断
 *   5. dryRun=true 时只渲染不发请求，把渲染后的 method/url/headers/body 推回前端
 *
 * 所有事件通过 {@link SseEmitterRegistry} 推到前端：
 *   pipeline-started / step-started / step-progress / step-completed / step-failed
 *   pipeline-completed / pipeline-cancelled / pipeline-error
 */
@Slf4j
@Component
public class PipelineExecutor {

    private final BrowserSessionManager manager;
    private final BrowserVarRepository varRepo;
    private final SavedRequestRepository savedRepo;
    private final ObjectMapper objectMapper;
    private final SseEmitterRegistry sseRegistry;
    private final PipelineRunRepository runRepo;

    public PipelineExecutor(BrowserSessionManager manager,
                            BrowserVarRepository varRepo,
                            SavedRequestRepository savedRepo,
                            ObjectMapper objectMapper,
                            SseEmitterRegistry sseRegistry,
                            PipelineRunRepository runRepo) {
        this.manager = manager;
        this.varRepo = varRepo;
        this.savedRepo = savedRepo;
        this.objectMapper = objectMapper;
        this.sseRegistry = sseRegistry;
        this.runRepo = runRepo;
    }

    private static final TypeReference<Map<String, String>> STRING_MAP_TYPE = new TypeReference<>() {};

    /** 单条失败记录，运行结束时序列化为 failures_json 落库。 */
    private record Failure(int stepIndex, String stepName, Integer itemIndex, String error,
                           String urlSample, String itemSample) {}

    /** 单次运行的可变状态——失败列表、step 统计、是否中断 + 每步 outputs 样本 + 每步响应样本。 */
    private static class RunCtx {
        final String runId;
        final List<Failure> failures = new ArrayList<>();
        final List<Map<String, Object>> stepOutputs = new ArrayList<>();
        /** 每步响应样本（single 1 条，foreach 前 3 条），用于历史回看时定位问题。 */
        final List<Map<String, Object>> stepResponses = new ArrayList<>();
        int okSteps = 0;
        int failedSteps = 0;
        Integer abortedAtStep = null;
        boolean cancelled = false;
        RunCtx(String runId) { this.runId = runId; }
    }

    /** 数组类型的 output 值落库时只保前 3 项作样本，避免大数组撑爆 DB / 浏览器渲染。 */
    private static final int OUTPUT_ARRAY_SAMPLE_SIZE = 3;
    /** 单条响应样本截断长度，避免几十 MB 响应撑爆 DB。 */
    private static final int STEP_RESPONSE_SAMPLE_BYTES = 16 * 1024;
    /** foreach 每步保存的响应样本最大条数（前 N 条 + 全部失败的）。 */
    private static final int FOREACH_RESPONSE_SAMPLE_MAX = 3;

    public void run(String taskId, String runId, Pipeline pipeline, List<PipelineDtos.StepDto> steps, boolean dryRun) {
        Map<String, JsonNode> chainVars = new LinkedHashMap<>();
        // 三层变量合并：legacy session vars (低) ← saved.lastExtractedValues (中) ← chainVars (高，由 TemplateRenderer 单独处理)
        Map<String, String> flatVars = new LinkedHashMap<>();
        flatVars.putAll(varRepo.asMap(pipeline.getSessionId()));     // legacy 兼容
        for (SavedRequest s : savedRepo.findBySession(pipeline.getSessionId())) {
            Map<String, String> ev = parseExtractedValues(s.getLastExtractedValuesJson());
            flatVars.putAll(ev);                                       // 覆盖 legacy 同名
        }
        Map<String, String> sessionVars = flatVars;
        RunCtx ctx = new RunCtx(runId);
        String finalStatus = "done";

        try {
            sseRegistry.publish(taskId, "pipeline-started", Map.of(
                    "totalSteps", steps.size(),
                    "pipelineId", pipeline.getId(),
                    "pipelineName", pipeline.getName(),
                    "runId", runId,
                    "dryRun", dryRun));

            for (int i = 0; i < steps.size(); i++) {
                if (!sseRegistry.hasEmitter(taskId)) {
                    log.info("[Pipeline] taskId={} 用户取消，跳出", taskId);
                    ctx.cancelled = true;
                    finalStatus = "cancelled";
                    sseRegistry.publish(taskId, "pipeline-cancelled", Map.of());
                    break;
                }
                PipelineDtos.StepDto step = steps.get(i);
                boolean stepFailed = false;
                boolean abortChain = false;
                try {
                    if ("single".equals(step.type())) {
                        runSingleStep(taskId, pipeline.getSessionId(), i, step, sessionVars, chainVars, dryRun, ctx);
                    } else {
                        runForeachStep(taskId, pipeline.getSessionId(), i, step, sessionVars, chainVars, dryRun, ctx);
                    }
                } catch (StepFatalException e) {
                    stepFailed = true;
                    String err = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                    ctx.failures.add(new Failure(i, step.name(), null, err, null, null));
                    sseRegistry.publish(taskId, "step-failed", Map.of(
                            "stepIndex", i, "stepName", step.name(), "error", err));
                    if (!step.continueOnError()) abortChain = true;
                } catch (Exception e) {
                    log.error("[Pipeline] step {} 未捕获异常", i, e);
                    stepFailed = true;
                    String err = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                    ctx.failures.add(new Failure(i, step.name(), null, err, null, null));
                    sseRegistry.publish(taskId, "step-failed", Map.of(
                            "stepIndex", i, "stepName", step.name(), "error", err));
                    if (!step.continueOnError()) abortChain = true;
                }
                if (stepFailed) ctx.failedSteps++; else ctx.okSteps++;
                if (abortChain) {
                    ctx.abortedAtStep = i;
                    finalStatus = "failed";
                    sseRegistry.publish(taskId, "pipeline-completed", Map.of(
                            "aborted", true, "abortedAtStep", i,
                            "runId", runId,
                            "failureCount", ctx.failures.size(),
                            "chainVarsSummary", summarize(chainVars)));
                    return;
                }
            }

            if (!ctx.cancelled) {
                sseRegistry.publish(taskId, "pipeline-completed", Map.of(
                        "aborted", false,
                        "runId", runId,
                        "failureCount", ctx.failures.size(),
                        "chainVarsSummary", summarize(chainVars)));
            }
        } catch (Exception e) {
            log.error("[Pipeline] taskId={} 致命错误", taskId, e);
            finalStatus = "failed";
            sseRegistry.publish(taskId, "pipeline-error",
                    Map.of("message", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        } finally {
            persistRunFinish(ctx, finalStatus, steps.size());
            sseRegistry.complete(taskId);
        }
    }

    private void persistRunFinish(RunCtx ctx, String status, int totalSteps) {
        try {
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("totalSteps", totalSteps);
            summary.put("okSteps", ctx.okSteps);
            summary.put("failedSteps", ctx.failedSteps);
            summary.put("failureCount", ctx.failures.size());
            if (ctx.abortedAtStep != null) summary.put("abortedAtStep", ctx.abortedAtStep);
            // 每步 outputs 样本——数组类型已在 sampleOutputValue 里截前 3
            summary.put("stepOutputs", ctx.stepOutputs);
            // 每步响应样本（single 1 条，foreach 前 3 条，单条截 16KB）
            summary.put("stepResponses", ctx.stepResponses);
            String summaryJson = objectMapper.writeValueAsString(summary);
            String failuresJson = objectMapper.writeValueAsString(ctx.failures);
            runRepo.finish(ctx.runId, status, System.currentTimeMillis(), summaryJson, failuresJson);
        } catch (Exception e) {
            log.warn("[Pipeline] 落库 run 终态失败 runId={}: {}", ctx.runId, e.getMessage());
        }
    }

    // ── single step ────────────────────────────────────────────────────────

    private void runSingleStep(String taskId, String sessionId, int stepIndex,
                               PipelineDtos.StepDto step, Map<String, String> sessionVars,
                               Map<String, JsonNode> chainVars, boolean dryRun, RunCtx ctx) {
        sseRegistry.publish(taskId, "step-started", Map.of(
                "stepIndex", stepIndex, "stepName", step.name(), "type", "single"));

        BrowserSessionManager.ExecuteRequest req;
        try {
            req = renderRequest(step.request(), sessionVars, chainVars, null);
        } catch (TemplateRenderer.MissingVarException e) {
            throw new StepFatalException("缺少变量：" + String.join(", ", e.getNames()));
        }

        if (dryRun) {
            // 干跑：只把渲染后的请求发回前端，不真发
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("stepIndex", stepIndex);
            payload.put("dryRun", true);
            payload.put("method", req.method());
            payload.put("url", req.url());
            payload.put("headers", req.headers());
            payload.put("bodySample", truncate(req.body(), 400));
            sseRegistry.publish(taskId, "step-completed", payload);
            return;
        }

        long t0 = System.currentTimeMillis();
        BrowserSessionManager.ExecutedResponse resp;
        try {
            resp = manager.execute(sessionId, req);
        } catch (Exception e) {
            throw new StepFatalException("请求失败：" + e.getMessage());
        }
        long elapsed = System.currentTimeMillis() - t0;

        // outputs：在响应 body 上求 jsonPath，写入 chain vars / 可选 session vars
        Map<String, Object> outputsPreview = applyOutputs(step.outputs(), resp.body(), chainVars,
                step.outputs() == null ? null : sessionId);

        // 收集本 step 写入的 outputs 值到 RunCtx，运行结束时连同 summary 落 DB（数组截前 3）
        if (step.outputs() != null && !step.outputs().isEmpty()) {
            Map<String, JsonNode> capturedOutputs = new LinkedHashMap<>();
            for (PipelineDtos.OutputSpec spec : step.outputs()) {
                capturedOutputs.put(spec.name(), chainVars.get(spec.name()));
            }
            ctx.stepOutputs.add(buildStepOutputEntry(stepIndex, step.name(), capturedOutputs));
        }

        // 收集响应样本到 RunCtx —— 历史回看时能看到这一步实际返回了什么
        Map<String, Object> respEntry = new LinkedHashMap<>();
        respEntry.put("stepIndex", stepIndex);
        respEntry.put("stepName", step.name());
        respEntry.put("type", "single");
        respEntry.put("status", resp.status());
        respEntry.put("statusText", resp.statusText());
        respEntry.put("finalUrl", resp.finalUrl());
        respEntry.put("elapsedMs", elapsed);
        respEntry.put("sample", truncate(resp.body(), STEP_RESPONSE_SAMPLE_BYTES));
        ctx.stepResponses.add(respEntry);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("stepIndex", stepIndex);
        payload.put("status", resp.status());
        payload.put("statusText", resp.statusText());
        payload.put("finalUrl", resp.finalUrl());
        payload.put("elapsedMs", elapsed);
        payload.put("sample", truncate(resp.body(), 200));
        payload.put("outputs", outputsPreview);
        sseRegistry.publish(taskId, "step-completed", payload);

        // 节流：本 step 完成后等待，再进入下一个 step（避免连发触发服务端限流）
        throttleSleep(taskId, step.requestIntervalMs());
    }

    // ── foreach step ───────────────────────────────────────────────────────

    private void runForeachStep(String taskId, String sessionId, int stepIndex,
                                PipelineDtos.StepDto step, Map<String, String> sessionVars,
                                Map<String, JsonNode> chainVars, boolean dryRun, RunCtx ctx) {
        JsonNode source = resolveForeachSource(step.source(), sessionVars, chainVars);
        if (source == null || !source.isArray()) {
            throw new StepFatalException("foreach 循环源不是数组（变量 " + step.source().varName()
                    + (step.source().jsonPath() != null ? " + " + step.source().jsonPath() : "") + "）");
        }
        int total = source.size();

        sseRegistry.publish(taskId, "step-started", Map.of(
                "stepIndex", stepIndex, "stepName", step.name(), "type", "foreach", "total", total));

        ArrayNode aggregatePerOutput = null;
        List<ArrayNode> aggregates = null;
        if (step.outputs() != null && !step.outputs().isEmpty()) {
            aggregates = new ArrayList<>();
            for (int k = 0; k < step.outputs().size(); k++) {
                aggregates.add(JsonNodeFactory.instance.arrayNode());
            }
        }

        int ok = 0, failed = 0;
        for (int i = 0; i < total; i++) {
            if (!sseRegistry.hasEmitter(taskId)) {
                sseRegistry.publish(taskId, "pipeline-cancelled", Map.of());
                throw new StepFatalException("已取消");
            }
            JsonNode item = source.get(i);
            long t0 = System.currentTimeMillis();
            try {
                BrowserSessionManager.ExecuteRequest req = renderRequest(step.request(), sessionVars, chainVars, item);
                if (dryRun) {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("stepIndex", stepIndex);
                    payload.put("index", i);
                    payload.put("dryRun", true);
                    payload.put("method", req.method());
                    payload.put("url", req.url());
                    payload.put("bodySample", truncate(req.body(), 200));
                    sseRegistry.publish(taskId, "step-progress", payload);
                    ok++;
                    continue;
                }

                BrowserSessionManager.ExecutedResponse resp = manager.execute(sessionId, req);
                long elapsed = System.currentTimeMillis() - t0;
                // 聚合：每个 output 在本次响应里求 jsonPath，push 进对应 array
                if (aggregates != null) {
                    for (int k = 0; k < step.outputs().size(); k++) {
                        PipelineDtos.OutputSpec spec = step.outputs().get(k);
                        JsonNode v = SimpleJsonPath.eval(resp.body(), spec.jsonPath(), objectMapper);
                        aggregates.get(k).add(v == null ? JsonNodeFactory.instance.nullNode() : v);
                    }
                }
                // 只收集前 N 条成功响应到 RunCtx（避免 50 条全存撑爆库）
                if (countForeachResponses(ctx, stepIndex) < FOREACH_RESPONSE_SAMPLE_MAX) {
                    Map<String, Object> respEntry = new LinkedHashMap<>();
                    respEntry.put("stepIndex", stepIndex);
                    respEntry.put("stepName", step.name());
                    respEntry.put("type", "foreach");
                    respEntry.put("itemIndex", i);
                    respEntry.put("status", resp.status());
                    respEntry.put("statusText", resp.statusText());
                    respEntry.put("elapsedMs", elapsed);
                    respEntry.put("sample", truncate(resp.body(), STEP_RESPONSE_SAMPLE_BYTES));
                    ctx.stepResponses.add(respEntry);
                }
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("stepIndex", stepIndex);
                payload.put("index", i);
                payload.put("status", resp.status());
                payload.put("statusText", resp.statusText());
                payload.put("elapsedMs", elapsed);
                payload.put("sample", truncate(resp.body(), 200));
                sseRegistry.publish(taskId, "step-progress", payload);
                ok++;
            } catch (TemplateRenderer.MissingVarException e) {
                // 渲染失败是 step 级致命（每次 item 都会失败）—— 直接抛出让外层中断
                throw new StepFatalException("缺少变量：" + String.join(", ", e.getNames()));
            } catch (Exception e) {
                long elapsed = System.currentTimeMillis() - t0;
                String err = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("stepIndex", stepIndex);
                payload.put("index", i);
                payload.put("elapsedMs", elapsed);
                payload.put("error", err);
                sseRegistry.publish(taskId, "step-progress", payload);
                failed++;
                // 登记到失败列表（落 DB），含 item 样本便于事后定位
                ctx.failures.add(new Failure(stepIndex, step.name(), i, err, null, truncate(itemToStr(item), 200)));
            }
            // 节流：每条 item 完成后等一会再发下一条（最后一条 sleep 一下也无所谓）
            if (i < total - 1) {
                throttleSleep(taskId, step.requestIntervalMs());
            }
        }

        // 写聚合到 chain vars / 可选 session vars
        Map<String, Object> outputsPreview = new LinkedHashMap<>();
        Map<String, JsonNode> capturedOutputs = new LinkedHashMap<>();
        if (aggregates != null) {
            for (int k = 0; k < step.outputs().size(); k++) {
                PipelineDtos.OutputSpec spec = step.outputs().get(k);
                ArrayNode arr = aggregates.get(k);
                chainVars.put(spec.name(), arr);
                capturedOutputs.put(spec.name(), arr);
                if (spec.persist()) {
                    try {
                        String json = objectMapper.writeValueAsString(arr);
                        varRepo.upsert(sessionId, spec.name(), json, System.currentTimeMillis());
                    } catch (Exception e) {
                        log.warn("[Pipeline] persist {} 失败: {}", spec.name(), e.getMessage());
                    }
                }
                outputsPreview.put(spec.name(), Map.of("type", "array", "size", arr.size()));
            }
        }
        // 收集到 RunCtx 落库（数组只存前 3 项作为样本）
        if (!capturedOutputs.isEmpty()) {
            ctx.stepOutputs.add(buildStepOutputEntry(stepIndex, step.name(), capturedOutputs));
        }

        Map<String, Object> done = new LinkedHashMap<>();
        done.put("stepIndex", stepIndex);
        done.put("type", "foreach");
        done.put("total", total);
        done.put("ok", ok);
        done.put("failed", failed);
        done.put("outputs", outputsPreview);
        sseRegistry.publish(taskId, "step-completed", done);
    }

    // ── 工具方法 ─────────────────────────────────────────────────────────────

    /** 解析 foreach 循环源：从 chainVars/sessionVars 取变量，再可选 jsonPath。 */
    private JsonNode resolveForeachSource(PipelineDtos.ForeachSource source,
                                          Map<String, String> sessionVars,
                                          Map<String, JsonNode> chainVars) {
        if (source == null || source.varName() == null) return null;
        JsonNode root = chainVars.get(source.varName());
        if (root == null) {
            String s = sessionVars.get(source.varName());
            if (s == null) return null;
            try { root = objectMapper.readTree(s); } catch (Exception e) { return null; }
        }
        if (source.jsonPath() != null && !source.jsonPath().isBlank()) {
            return SimpleJsonPath.eval(root, source.jsonPath());
        }
        return root;
    }

    /** 对响应应用 outputs 规则，返回供前端展示的 preview。 */
    private Map<String, Object> applyOutputs(List<PipelineDtos.OutputSpec> outputs, String responseBody,
                                              Map<String, JsonNode> chainVars, String sessionIdForPersist) {
        Map<String, Object> preview = new LinkedHashMap<>();
        if (outputs == null) return preview;
        for (PipelineDtos.OutputSpec spec : outputs) {
            JsonNode v = SimpleJsonPath.eval(responseBody, spec.jsonPath(), objectMapper);
            JsonNode stored = v == null ? JsonNodeFactory.instance.nullNode() : v;
            chainVars.put(spec.name(), stored);
            if (spec.persist() && sessionIdForPersist != null) {
                try {
                    String json = stored.isValueNode() ? stored.asText() : objectMapper.writeValueAsString(stored);
                    varRepo.upsert(sessionIdForPersist, spec.name(), json, System.currentTimeMillis());
                } catch (Exception e) {
                    log.warn("[Pipeline] persist {} 失败: {}", spec.name(), e.getMessage());
                }
            }
            preview.put(spec.name(), Map.of("type", stored.getNodeType().toString().toLowerCase(),
                    "sample", truncate(SimpleJsonPath.stringify(stored), 120)));
        }
        return preview;
    }

    private BrowserSessionManager.ExecuteRequest renderRequest(ExecuteRequestBody request,
                                                                Map<String, String> sessionVars,
                                                                Map<String, JsonNode> chainVars,
                                                                JsonNode item) {
        if (request.curl() != null && !request.curl().isBlank()) {
            String rendered = TemplateRenderer.renderWith(request.curl(), sessionVars, chainVars, item);
            CurlParser.ParsedCurl p = CurlParser.parse(rendered);
            return new BrowserSessionManager.ExecuteRequest(p.method(), p.url(), p.headers(), p.body());
        }
        String url = TemplateRenderer.renderWith(request.url(), sessionVars, chainVars, item);
        Map<String, String> headers = null;
        if (request.headers() != null) {
            headers = new LinkedHashMap<>();
            for (Map.Entry<String, String> e : request.headers().entrySet()) {
                headers.put(e.getKey(), TemplateRenderer.renderWith(e.getValue(), sessionVars, chainVars, item));
            }
        }
        String body = TemplateRenderer.renderWith(request.body(), sessionVars, chainVars, item);
        String method = (request.method() == null || request.method().isBlank())
                ? "GET" : request.method().toUpperCase();
        return new BrowserSessionManager.ExecuteRequest(method, url, headers, body);
    }

    private Map<String, Object> summarize(Map<String, JsonNode> chainVars) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, JsonNode> e : chainVars.entrySet()) {
            JsonNode v = e.getValue();
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("type", v.getNodeType().toString().toLowerCase());
            if (v.isArray()) info.put("size", v.size());
            else if (v.isObject()) info.put("fields", v.size());
            out.put(e.getKey(), info);
        }
        return out;
    }

    private static String truncate(String s, int n) {
        if (s == null) return "";
        return s.length() <= n ? s : s.substring(0, n) + "…";
    }

    private static String itemToStr(JsonNode item) {
        if (item == null) return "";
        try { return item.toString(); } catch (Exception e) { return ""; }
    }

    private Map<String, String> parseExtractedValues(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try { return objectMapper.readValue(json, STRING_MAP_TYPE); }
        catch (Exception e) {
            log.warn("[Pipeline] 解析 lastExtractedValues 失败: {}", e.getMessage());
            return new LinkedHashMap<>();
        }
    }

    /** RunCtx.stepResponses 里属于某个 step 的条目数（用来控制 foreach 只存前 N 条）。 */
    private static int countForeachResponses(RunCtx ctx, int stepIndex) {
        int c = 0;
        for (Map<String, Object> r : ctx.stepResponses) {
            Object idx = r.get("stepIndex");
            if (idx instanceof Integer && ((Integer) idx) == stepIndex) c++;
        }
        return c;
    }

    /**
     * 节流 sleep。把整段 interval 切成 200ms 片段，每段检查 SSE emitter 是否还在——
     * 用户取消时不必等满 interval。Thread.interrupt 也能立即唤醒。
     */
    private void throttleSleep(String taskId, Integer intervalMs) {
        if (intervalMs == null || intervalMs <= 0) return;
        int remaining = intervalMs;
        while (remaining > 0) {
            if (!sseRegistry.hasEmitter(taskId)) return;
            int chunk = Math.min(200, remaining);
            try {
                Thread.sleep(chunk);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            remaining -= chunk;
        }
    }

    /**
     * 把一个 output value 转换成 DB 持久化的样本：
     *   - 数组 → 截前 {@link #OUTPUT_ARRAY_SAMPLE_SIZE} 项 + 附带 totalSize
     *   - 对象 / 标量 → 原样保留（业务对象一般 KB 级，可接受）
     * 返回 Map 而非 JsonNode 是为了让 Jackson 序列化时把 size 信息一并保留。
     */
    private static Map<String, Object> sampleOutputValue(JsonNode value) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (value == null || value.isNull()) {
            out.put("type", "null");
            out.put("value", null);
            return out;
        }
        if (value.isArray()) {
            int total = value.size();
            ArrayNode sample = JsonNodeFactory.instance.arrayNode();
            int cap = Math.min(total, OUTPUT_ARRAY_SAMPLE_SIZE);
            for (int i = 0; i < cap; i++) sample.add(value.get(i));
            out.put("type", "array");
            out.put("totalSize", total);
            out.put("sample", sample);
            out.put("truncated", total > OUTPUT_ARRAY_SAMPLE_SIZE);
            return out;
        }
        out.put("type", value.getNodeType().toString().toLowerCase());
        out.put("value", value);
        return out;
    }

    /** 把一个 step 的 outputs 名→值 转成 RunCtx 保存的 entry。 */
    private static Map<String, Object> buildStepOutputEntry(int stepIndex, String stepName,
                                                            Map<String, JsonNode> outputs) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("stepIndex", stepIndex);
        entry.put("stepName", stepName);
        Map<String, Object> outs = new LinkedHashMap<>();
        for (Map.Entry<String, JsonNode> e : outputs.entrySet()) {
            outs.put(e.getKey(), sampleOutputValue(e.getValue()));
        }
        entry.put("outputs", outs);
        return entry;
    }

    /** step 级致命错误，根据 continueOnError 决定是否中断整链。 */
    public static class StepFatalException extends RuntimeException {
        public StepFatalException(String msg) { super(msg); }
    }
}
