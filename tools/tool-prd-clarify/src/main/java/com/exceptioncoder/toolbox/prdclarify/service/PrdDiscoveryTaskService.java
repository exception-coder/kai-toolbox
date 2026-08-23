package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdDiscoveryRun;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdDiscoveryRunRepository;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** 持久化并执行可恢复的后台规格探索，最多进行三次完成性循环。 */
@Slf4j
@Service
public class PrdDiscoveryTaskService {

    private static final int MAX_ATTEMPTS = 3;
    private static final int MAX_ERROR_LENGTH = 500;

    private final PrdDiscoveryRunRepository runRepository;
    private final PrdSessionRepository sessionRepository;
    private final PrdDiscoveryService discoveryService;
    private final PrdInitialSpecValidator validator;
    private final AsyncTaskExecutor taskExecutor;
    private final ObjectMapper mapper;

    public PrdDiscoveryTaskService(
            PrdDiscoveryRunRepository runRepository,
            PrdSessionRepository sessionRepository,
            PrdDiscoveryService discoveryService,
            PrdInitialSpecValidator validator,
            AsyncTaskExecutor taskExecutor,
            ObjectMapper mapper
    ) {
        this.runRepository = runRepository;
        this.sessionRepository = sessionRepository;
        this.discoveryService = discoveryService;
        this.validator = validator;
        this.taskExecutor = taskExecutor;
        this.mapper = mapper;
    }

    /** 幂等登记后台运行并立即返回，不等待知识查询或 Agent。 */
    public PrdDiscoveryRun schedule(String sessionId) {
        PrdSession session = requireSession(sessionId);
        Optional<PrdDiscoveryRun> active = runRepository.findRunningBySessionId(sessionId);
        if (active.isPresent()) {
            return active.get();
        }
        if (!List.of("DISCOVERING", "CLARIFYING", "ERROR").contains(session.getStatus())) {
            throw new IllegalStateException("当前状态不允许开始探索: " + session.getStatus());
        }
        long now = System.currentTimeMillis();
        PrdDiscoveryRun run = new PrdDiscoveryRun(
                UUID.randomUUID().toString(), sessionId, "RUNNING", "QUEUED", 5, 0, MAX_ATTEMPTS,
                PrdInitialSpecValidator.CRITERIA_VERSION, PrdDiscoveryService.PROMPT_VERSION,
                sha256(inputSnapshot(session)), normalizeEngine(session.getEngine()), session.getModel(),
                null, null, null, null, null, now, null, now, now);
        if (!runRepository.insert(run)) {
            return runRepository.findRunningBySessionId(sessionId)
                    .orElseThrow(() -> new IllegalStateException("探索任务并发登记失败"));
        }
        sessionRepository.updateStatus(sessionId, "DISCOVERING");
        dispatch(run);
        return run;
    }

    public Optional<PrdDiscoveryRun> latest(String sessionId) {
        requireSession(sessionId);
        return runRepository.findLatestBySessionId(sessionId);
    }

    /** 应用重启后继续未终结运行；前端是否在线不影响执行。 */
    @EventListener(ApplicationReadyEvent.class)
    public void resumeRunningTasks() {
        for (PrdDiscoveryRun run : runRepository.findRunning()) {
            dispatch(run);
        }
    }

    private void dispatch(PrdDiscoveryRun run) {
        try {
            taskExecutor.execute(() -> execute(run.id()));
        } catch (RuntimeException error) {
            fail(run, validationJson(false, List.of()), "后台执行器拒绝任务: " + message(error));
        }
    }

    private void execute(String runId) {
        PrdDiscoveryRun run = runRepository.findById(runId).orElse(null);
        if (run == null || !"RUNNING".equals(run.status())) {
            return;
        }
        String previousOutput = value(run.lastOutput());
        List<String> gaps = validationGaps(run.validationJson());
        int firstAttempt = Math.max(1, run.attempt() + 1);
        if (firstAttempt > MAX_ATTEMPTS) {
            fail(run, validationJson(false, gaps), "探索已达到 3 次执行上限，请重新探索");
            return;
        }
        try {
            runRepository.updateAttempt(runId, run.attempt(), "COLLECTING_EVIDENCE", 15, null);
            PrdDiscoveryService.DiscoveryContext context = discoveryService.prepare(run.sessionId());
            for (int attempt = firstAttempt; attempt <= MAX_ATTEMPTS; attempt++) {
                int progress = 25 + (attempt - 1) * 22;
                runRepository.updateAttempt(runId, attempt, "VIBE_EXECUTING", progress,
                        attempt == 1 ? null : "第 " + attempt + " 次：按完成性缺口继续 ReAct");
                try {
                    PrdDiscoveryService.DiscoveryAttempt result = discoveryService.generate(
                            context, attempt, previousOutput, gaps);
                    previousOutput = bounded(result.output(), 100_000);
                    runRepository.recordAgentResult(
                            runId, result.vibeSessionId(), result.traceId(), previousOutput);
                    runRepository.updateAttempt(runId, attempt, "VALIDATING", progress + 12, null);
                    PrdInitialSpecValidator.ValidationResult validation = validator.validate(previousOutput);
                    gaps = validation.gaps();
                    String validationJson = validationJson(validation.complete(), gaps);
                    runRepository.recordValidation(runId, validationJson);
                    if (validation.complete()) {
                        runRepository.updateAttempt(runId, attempt, "PUBLISHING", 95, null);
                        discoveryService.publish(run.sessionId(), previousOutput);
                        runRepository.complete(runId, validationJson, System.currentTimeMillis());
                        return;
                    }
                } catch (RuntimeException error) {
                    gaps = List.of("Vibe Coding 第 " + attempt + " 次执行失败：" + message(error));
                    runRepository.recordValidation(runId, validationJson(false, gaps));
                    log.warn("[prd-discovery] 后台探索本轮失败 runId={} attempt={}", runId, attempt, error);
                }
            }
            fail(run, validationJson(false, gaps), "探索已完成 3 次循环，仍未通过初始化规格检查");
        } catch (RuntimeException error) {
            fail(run, validationJson(false, gaps), message(error));
            log.warn("[prd-discovery] 后台探索失败 runId={} sessionId={}", runId, run.sessionId(), error);
        }
    }

    private void fail(PrdDiscoveryRun run, String validationJson, String error) {
        String boundedError = bounded(message(error), MAX_ERROR_LENGTH);
        if (runRepository.fail(run.id(), validationJson, boundedError, System.currentTimeMillis())) {
            sessionRepository.updateError(run.sessionId(), boundedError);
        }
    }

    private String validationJson(boolean complete, List<String> gaps) {
        try {
            return mapper.writeValueAsString(Map.of(
                    "criteriaVersion", PrdInitialSpecValidator.CRITERIA_VERSION,
                    "complete", complete,
                    "gaps", gaps));
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("序列化探索校验结果失败", error);
        }
    }

    private List<String> validationGaps(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            java.util.ArrayList<String> gaps = new java.util.ArrayList<>();
            for (com.fasterxml.jackson.databind.JsonNode node : mapper.readTree(json).path("gaps")) {
                String gap = node.asText("").trim();
                if (!gap.isBlank()) gaps.add(gap);
            }
            return List.copyOf(gaps);
        } catch (JsonProcessingException ignored) {
            return List.of();
        }
    }

    private PrdSession requireSession(String sessionId) {
        return sessionRepository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
    }

    private static String inputSnapshot(PrdSession session) {
        return value(session.getTitle()) + "\n" + value(session.getRawInput()) + "\n"
                + value(session.getProject()) + "\n" + value(session.getModule());
    }

    private static String normalizeEngine(String engine) {
        return "codex".equalsIgnoreCase(engine) ? "codex" : AgentOneShotRunner.DEFAULT_ENGINE;
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("运行环境不支持 SHA-256", error);
        }
    }

    private static String message(Throwable error) {
        if (error == null) return "未知错误";
        String text = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        return text.replace('\n', ' ').replace('\r', ' ').trim();
    }

    private static String message(String error) {
        return error == null || error.isBlank() ? "未知错误" : error;
    }

    private static String bounded(String value, int maxLength) {
        String text = value == null ? "" : value;
        return text.length() <= maxLength ? text : text.substring(0, maxLength);
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }
}
