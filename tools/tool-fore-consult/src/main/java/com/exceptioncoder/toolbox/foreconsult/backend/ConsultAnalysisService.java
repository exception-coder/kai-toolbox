package com.exceptioncoder.toolbox.foreconsult.backend;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Durable task admission and a bounded adapter to the existing runner; never replays unknown executions. */
@Service
public class ConsultAnalysisService {
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(ConsultAnalysisService.class);
    private final ConsultBackendStore store;
    private final ConsultBackendAuth auth;
    private final ConsultAnalysisEvidence evidence;
    private final ConsultAnalysisModel model;
    private final ConsultAnalysisImages images;
    private final ConsultExternalImageSource externalImages;
    private final ObjectMapper mapper;
    private final long timeoutMs;
    private final ConsultAnalysisTelemetry telemetry;
    private final Semaphore slots = new Semaphore(2);
    private final ConcurrentHashMap<String, Thread> running = new ConcurrentHashMap<>();
    private volatile boolean ready;

    @org.springframework.beans.factory.annotation.Autowired
    public ConsultAnalysisService(ConsultBackendStore store, ConsultBackendAuth auth, ConsultAnalysisEvidence evidence,
            ConsultAnalysisModel model, ConsultAnalysisImages images, ObjectMapper mapper,
            ConsultExternalImageSource externalImages,
            @Value("${toolbox.fore-consult.backend.timeout-ms:180000}") long timeoutMs,
            ConsultAnalysisTelemetry telemetry) {
        this.store = store; this.auth = auth; this.evidence = evidence; this.model = model; this.images = images;
        this.externalImages = externalImages;
        this.mapper = mapper.copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
        this.mapper.disable(com.fasterxml.jackson.databind.MapperFeature.ALLOW_COERCION_OF_SCALARS);
        this.mapper.enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
        if (timeoutMs < 1000 || timeoutMs > 600000) throw new IllegalArgumentException("分析任务超时须为 1000–600000ms");
        this.timeoutMs = timeoutMs;
        this.telemetry = telemetry;
    }

    public ConsultAnalysisService(ConsultBackendStore store, ConsultBackendAuth auth, ConsultAnalysisEvidence evidence,
            ConsultAnalysisModel model, ConsultAnalysisImages images, ObjectMapper mapper,
            ConsultExternalImageSource externalImages, long timeoutMs) {
        this(store, auth, evidence, model, images, mapper, externalImages, timeoutMs,
                new ConsultAnalysisTelemetry(com.exceptioncoder.toolbox.llm.observability.AgentTelemetry.noop(512)));
    }

    ConsultAnalysisService(ConsultBackendStore store, ConsultBackendAuth auth, ConsultAnalysisEvidence evidence,
            ConsultAnalysisModel model, ConsultAnalysisImages images, ObjectMapper mapper, long timeoutMs) {
        this(store, auth, evidence, model, images, mapper, new ConsultExternalImageSource("", "", ""), timeoutMs);
    }

    public record TaskView(String taskId, String requestId, String problemId, String conversationId, String status,
                           JsonNode result, Map<String, Object> error, long createdAt, Long startedAt,
                           Long finishedAt, Long policyVersion,
                           @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_EMPTY) List<String> attachmentIds) {}

    public record DirectResult(String requestId, JsonNode result) {}

    public DirectResult analyzeOnce(ConsultBackendStore.Client client, String raw) {
        var input = parse(raw).withDefaultMode();
        authorize(client, input);
        if (!input.attachmentIds().isEmpty()) {
            throw ConsultBackendException.invalid("即时分析请使用 imageRefs，不接受已上传附件");
        }
        if (!input.imageRefs().isEmpty()) { externalImages.requireAccess(client); }
        if (!slots.tryAcquire()) {
            throw new ConsultBackendException(429, "TASK_LIMITED", "分析繁忙，请稍后重试", true);
        }
        String executionId = UUID.randomUUID().toString();
        var work = new java.util.concurrent.FutureTask<DirectResult>(() -> {
            try (var execution = telemetry.start(client.id(), executionId, input, 0)) {
                execution.attribute("consult.mode", "DIRECT");
                try {
                    auth.active(client.id());
                    List<ConsultAnalysisEvidence.Packet> packets;
                    try (var stage = execution.stage("evidence")) {
                        packets = evidence.collect(input);
                        stage.success();
                    }
                    ConsultAnalysisImages.Inputs imageInputs;
                    try (var stage = execution.stage("images")) {
                        imageInputs = images.resolveExternal(client, input.imageRefs(), externalImages);
                        stage.success();
                    }
                    if (Thread.currentThread().isInterrupted()) {
                        throw new InterruptedException();
                    }
                    var result = mapper.readTree(model.analyze(executionId, input, packets, imageInputs, false, execution));
                    auth.active(client.id());
                    execution.complete(result.path("missingInformation").isEmpty() ? "SUCCEEDED" : "NEEDS_INFORMATION", null);
                    return new DirectResult(input.requestId(), result);
                } catch (Exception error) {
                    execution.complete("FAILED", error instanceof ConsultBackendException known ? known.code() : "ANALYSIS_FAILED");
                    throw error;
                }
            }
        });
        try {
            Thread.ofVirtual().name("consult-direct-" + executionId).start(() -> {
                try { work.run(); }
                finally { slots.release(); }
            });
        } catch (RuntimeException | Error startFailure) {
            slots.release();
            throw startFailure;
        }
        try {
            return work.get(timeoutMs, java.util.concurrent.TimeUnit.MILLISECONDS);
        } catch (java.util.concurrent.TimeoutException timeout) {
            work.cancel(true);
            requestCancellation(executionId);
            throw new ConsultBackendException(504, "ANALYSIS_TIMEOUT", "分析超时，可由调用方重新发起", true);
        } catch (InterruptedException interrupted) {
            work.cancel(true);
            requestCancellation(executionId);
            Thread.currentThread().interrupt();
            throw new ConsultBackendException(503, "EXECUTION_INTERRUPTED", "分析等待被中断", true);
        } catch (java.util.concurrent.ExecutionException failure) {
            if (failure.getCause() instanceof ConsultBackendException known) { throw known; }
            LOG.warn("Consult direct analysis failed execution={} kind={}", executionId, failure.getCause().getClass().getSimpleName());
            throw new ConsultBackendException(502, "ANALYSIS_FAILED", "分析未完成，可由调用方重新发起", true);
        }
    }

    public synchronized TaskView submit(ConsultBackendStore.Client client, String raw) {
        var input = parse(raw);
        authorize(client, input);
        String normalized;
        try { normalized = mapper.writeValueAsString(input); }
        catch (Exception error) { throw ConsultBackendException.invalid("无法读取请求内容"); }
        String hash = ConsultBackendAuth.hash(normalized);
        var existing = store.request(client.id(), input.requestId());
        if (existing.isPresent()) {
            if (!existing.get().inputHash().equals(hash)) throw new ConsultBackendException(409, "IDEMPOTENCY_CONFLICT", "相同 requestId 已用于不同内容", false);
            return view(existing.get());
        }
        // Existing request IDs are resolved above against the original caller input, before applying a new default.
        try { normalized = mapper.writeValueAsString(input.withDefaultMode()); }
        catch (Exception error) { throw ConsultBackendException.invalid("无法读取请求内容"); }
        images.resolve(client, input.attachmentIds(), false);
        if (!input.imageRefs().isEmpty()) { externalImages.requireAccess(client); }
        int unfinishedBeforeAdmission = store.unfinished(null);
        if (unfinishedBeforeAdmission >= 64 || store.unfinished(client.id()) >= 8) throw new ConsultBackendException(429, "TASK_LIMITED", "分析任务繁忙，请保留请求标识稍后重试", true);
        var task = new ConsultBackendStore.Task(UUID.randomUUID().toString(), client.id(), input.requestId(), hash,
                normalized, "QUEUED", null, null, System.currentTimeMillis(), null, null, null);
        images.admit(client, input.attachmentIds(), () -> store.insertTask(task));
        LOG.info("Consult backend admitted client={} request={} task={} unfinishedBeforeAdmission={}",
                client.id(), input.requestId(), task.id(), unfinishedBeforeAdmission);
        return view(store.task(task.id()).orElseThrow());
    }

    public TaskView get(ConsultBackendStore.Client client, String id) { return view(owned(client, id)); }

    public TaskView findRequest(ConsultBackendStore.Client client, String requestId) {
        return view(store.request(client.id(), requestId).orElseThrow(ConsultAnalysisService::notFound));
    }

    public TaskView cancel(ConsultBackendStore.Client client, String id) {
        var task = owned(client, id);
        store.cancel(task.id(), "CANCELLED_BY_CALLER");
        if (running.containsKey(id)) requestCancellation(id);
        return get(client, id);
    }

    private ConsultBackendStore.Task owned(ConsultBackendStore.Client client, String id) {
        return store.task(id).filter(t -> t.clientId().equals(client.id())).orElseThrow(ConsultAnalysisService::notFound);
    }

    private static ConsultBackendException notFound() { return new ConsultBackendException(404, "TASK_NOT_FOUND", "任务不存在或不在当前应用授权范围", false); }

    private void authorize(ConsultBackendStore.Client client, ConsultAnalysisInput input) {
        if (!client.tenantId().equals(input.tenantId())) throw new ConsultBackendException(403, "TENANT_NOT_ALLOWED", "企业不在应用授权范围", false);
        if (!auth.projectIds(client).containsAll(input.systemIds())) throw new ConsultBackendException(403, "PROJECT_NOT_ALLOWED", "项目不在应用授权范围", false);
        auth.validateProjects(input.systemIds());
    }

    ConsultAnalysisInput parse(String raw) {
        if (raw == null || raw.length() > 100000) throw ConsultBackendException.invalid("请求超过 100000 字符");
        try { return mapper.readValue(raw, ConsultAnalysisInput.class).validated(); }
        catch (ConsultBackendException error) { throw error; }
        catch (Exception error) { throw ConsultBackendException.invalid("请求 JSON 无效，存在未知字段或缺少必要数据"); }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recover() { store.recover(); ready = true; }

    @Scheduled(fixedDelay = 1000, initialDelay = 1000)
    public synchronized void tick() {
        if (!ready) return;
        try { auth.requireEnabled(); } catch (ConsultBackendException disabled) { return; }
        for (var entry : running.entrySet()) {
            var task = store.task(entry.getKey()).orElseThrow();
            try { auth.active(task.clientId()); }
            catch (ConsultBackendException revoked) { store.cancel(task.id(), "CLIENT_REVOKED"); }
            if (task.startedAt() != null && System.currentTimeMillis() - task.startedAt() >= timeoutMs) store.cancel(task.id(), "ANALYSIS_TIMEOUT");
            if ("CANCEL_REQUESTED".equals(store.task(task.id()).orElseThrow().status())) requestCancellation(task.id());
        }
        for (var task : store.queued()) {
            if (!slots.tryAcquire()) return;
            if (!store.claim(task.id())) { slots.release(); continue; }
            var thread = Thread.ofVirtual().name("consult-analysis-" + task.id()).unstarted(() -> execute(task.id()));
            running.put(task.id(), thread);
            thread.start();
        }
    }

    private void execute(String id) {
        ConsultAnalysisTelemetry.Execution execution = null;
        try {
            var task = store.task(id).orElseThrow();
            if (!"RUNNING".equals(task.status())) { store.finish(id, "CANCELLED", null, "CANCELLED_BY_CALLER"); return; }
            var client = auth.active(task.clientId());
            var input = parse(task.input());
            execution = telemetry.start(client.id(), id, input, task.startedAt() - task.createdAt());
            execution.attribute("consult.mode", "ASYNC");
            authorize(client, input);
            List<ConsultAnalysisEvidence.Packet> packets;
            try (var stage = execution.stage("evidence")) {
                packets = evidence.collect(input);
                stage.success();
            }
            ConsultAnalysisImages.Inputs imageInputs;
            try (var stage = execution.stage("images")) {
                imageInputs = input.imageRefs().isEmpty() ? images.resolve(client, input.attachmentIds(), true)
                        : images.resolveExternal(client, input.imageRefs(), externalImages);
                stage.success();
            }
            if (!"RUNNING".equals(store.task(id).orElseThrow().status())) {
                store.finish(id, "CANCELLED", null, "CANCELLED_BY_CALLER");
                var stopped = store.task(id).orElseThrow();
                execution.complete(stopped.status(), stopped.errorCode());
                return;
            }
            String result = model.analyze(id, input, packets, imageInputs, true, execution);
            var current = store.task(id).orElseThrow();
            if (current.startedAt() != null && System.currentTimeMillis() - current.startedAt() >= timeoutMs) store.cancel(id, "ANALYSIS_TIMEOUT");
            // Credential expiry/revocation while generating must not publish a fresh successful result.
            auth.active(client.id());
            String status = mapper.readTree(result).path("missingInformation").isEmpty() ? "SUCCEEDED" : "NEEDS_INFORMATION";
            try (var stage = execution.stage("persistence")) {
                store.finish(id, status, result, null);
                stage.success();
            }
            var finished = store.task(id).orElseThrow();
            execution.complete(finished.status(), finished.errorCode());
        } catch (Exception error) {
            String code = error instanceof ConsultBackendException known ? known.code() : "ANALYSIS_FAILED";
            LOG.warn("Consult backend analysis failed task={} code={} kind={}", id, code, error.getClass().getSimpleName());
            store.finish(id, "FAILED", null, code);
            if (execution != null) {
                var finished = store.task(id).orElseThrow();
                execution.complete(finished.status(), finished.errorCode());
            }
        } finally {
            try {
                if (execution != null) {
                    execution.close();
                }
            } finally {
                running.remove(id);
                slots.release();
            }
        }
    }

    private TaskView view(ConsultBackendStore.Task t) {
        try {
            var input = parse(t.input());
            var error = t.errorCode() == null ? null : Map.<String, Object>of("code", t.errorCode(),
                    "message", message(t.errorCode()), "retryable", List.of("ANALYSIS_FAILED", "ANALYSIS_TIMEOUT", "EXECUTION_INTERRUPTED", "INVALID_ANALYSIS_OUTPUT", "ANALYSIS_NOT_CONFIGURED").contains(t.errorCode()));
            return new TaskView(t.id(), t.requestId(), input.problemId(), input.conversationId(), t.status(),
                    t.result() == null ? null : mapper.readTree(t.result()), error, t.createdAt(), t.startedAt(), t.finishedAt(), t.policyVersion(), input.attachmentIds());
        } catch (ConsultBackendException e) { throw e; }
        catch (Exception e) { throw new IllegalStateException("分析任务记录不可读", e); }
    }

    private static String message(String code) {
        return switch (code) {
            case "ANALYSIS_TIMEOUT" -> "分析超时，问题已保留；重试须使用新 requestId";
            case "EXECUTION_INTERRUPTED" -> "上次执行被中断，未自动重发；可显式发起新任务";
            case "CANCELLED_BY_CALLER" -> "调用方已请求取消，请以任务最终状态为准";
            case "CLIENT_REVOKED", "INVALID_CLIENT_TOKEN" -> "应用授权已失效，请联系管理员";
            case "INVALID_ANALYSIS_OUTPUT" -> "模型结果未通过结构或证据校验，未作为分析结果发布";
            case "ANALYSIS_NOT_CONFIGURED" -> "咨询默认账号或引擎尚未就绪，请联系管理员";
            case "ATTACHMENT_EXPIRED" -> "原图已过期，请重新上传并使用新 requestId；原任务和结果保留";
            case "ATTACHMENT_RETENTION_LIMIT" -> "原图已达到保留期限，请重新上传并使用新 requestId；原任务和结果保留";
            case "ATTACHMENT_NOT_FOUND" -> "原图不存在或不在当前应用企业范围，请核对上传结果";
            case "IMAGE_NOT_READABLE" -> "模型无法读取原图，请提供清晰的静态 PNG/JPEG 后重新提交";
            case "IMAGE_SOURCE_NOT_ALLOWED" -> "应用未配置原图读取来源，请联系管理员";
            case "IMAGE_SOURCE_UNAVAILABLE" -> "暂时无法从应用读取原图，核对后请用新 requestId 发起重试";
            case "IMAGE_DIGEST_MISMATCH" -> "原图与提交摘要不一致，请核对应用图片版本";
            case "IMAGES_TOO_LARGE" -> "原图为空或超过图片大小限制";
            case "IMAGE_MODEL_UNSUPPORTED" -> "当前咨询模型未声明图像输入能力，请管理员核对账号的模型目录后重试";
            default -> "分析未完成，问题已保留；请核对输入或联系管理员";
        };
    }

    @PreDestroy public synchronized void close() {
        ready = false;
        running.forEach((id, thread) -> { store.cancel(id, "EXECUTION_INTERRUPTED"); requestCancellation(id); });
    }

    private void requestCancellation(String id) {
        telemetry.cancellationRequested(id);
        try { model.cancel(id); }
        catch (RuntimeException error) { LOG.warn("Consult analysis cancellation unconfirmed task={} kind={}", id, error.getClass().getSimpleName()); }
    }
}
