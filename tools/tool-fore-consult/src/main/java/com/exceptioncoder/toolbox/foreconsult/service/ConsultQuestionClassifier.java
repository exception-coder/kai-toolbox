package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.ClassifyQuestionRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.QuestionClassificationView;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurn;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnRepository;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class ConsultQuestionClassifier {

    private static final Logger log = LoggerFactory.getLogger(ConsultQuestionClassifier.class);
    private static final String FOLLOW_UP = "FOLLOW_UP";
    private static final String NEW_QUESTION = "NEW_QUESTION";
    private static final String SYSTEM_PROMPT = """
            你是业务咨询会话的问题边界分类器，只判断“本次输入”是否仍属于“首个问题”的追问。
            FOLLOW_UP：澄清、补充条件、询问原因/步骤/结果、纠正或引用此前内容。
            NEW_QUESTION：出现可脱离首个问题独立回答的新业务目标。
            无法确定时必须判定 FOLLOW_UP，避免误拦用户。
            只输出 JSON：{"classification":"FOLLOW_UP|NEW_QUESTION","reason":"不超过30字"}
            """;

    private final ObjectProvider<AgentOneShotRunner> runnerProvider;
    private final ConsultSessionRepository sessionRepository;
    private final ConsultTurnRepository turnRepository;
    private final ObjectMapper mapper;
    private final long timeoutMs;

    public ConsultQuestionClassifier(ObjectProvider<AgentOneShotRunner> runnerProvider,
                                     ConsultSessionRepository sessionRepository,
                                     ConsultTurnRepository turnRepository,
                                     ObjectMapper mapper,
                                     @Value("${toolbox.fore-consult.question-classify-timeout-ms:15000}")
                                     long timeoutMs) {
        this.runnerProvider = runnerProvider;
        this.sessionRepository = sessionRepository;
        this.turnRepository = turnRepository;
        this.mapper = mapper;
        this.timeoutMs = Math.max(100, timeoutMs);
    }

    public QuestionClassificationView classify(String sessionId, ClassifyQuestionRequest request) {
        if (sessionRepository.findById(sessionId).isEmpty()) {
            throw new ResponseStatusException(NOT_FOUND, "咨询会话不存在: " + sessionId);
        }
        String firstQuestion = turnRepository.findBySession(sessionId).stream()
                .map(ConsultTurn::getQuestion)
                .filter(value -> value != null && !value.isBlank())
                .findFirst()
                .orElse(request.firstQuestion());
        if (firstQuestion == null || firstQuestion.isBlank()) {
            return fallback("首问尚未归档，按追问放行");
        }
        AgentOneShotRunner runner = runnerProvider.getIfAvailable();
        if (runner == null) {
            return fallback("识别引擎不可用，按追问放行");
        }
        String userPrompt = "【首个问题】\n%s\n\n【本次输入】\n%s"
                .formatted(firstQuestion.trim(), request.question().trim());
        try {
            long startedAt = System.nanoTime();
            String raw = runWithTimeout(runner, userPrompt, normalizeEngine(request.engine()));
            log.info("[fore-consult] 问题边界识别完成，engine={} latencyMs={}", request.engine(),
                    TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt));
            JsonNode result = mapper.readTree(stripFence(raw == null ? "" : raw.trim()));
            String classification = result.path("classification").asText("").trim().toUpperCase();
            if (!FOLLOW_UP.equals(classification) && !NEW_QUESTION.equals(classification)) {
                return fallback("识别结果无效，按追问放行");
            }
            String reason = result.path("reason").asText("").trim();
            return new QuestionClassificationView(classification,
                    reason.isBlank() ? "已完成问题边界识别" : truncate(reason, 60));
        } catch (TimeoutException e) {
            return fallback("识别超时，按追问放行");
        } catch (Exception e) {
            log.warn("[fore-consult] 问题边界识别失败，sessionId={}: {}", sessionId, e.getMessage());
            return fallback("识别失败，按追问放行");
        }
    }

    private String runWithTimeout(AgentOneShotRunner runner, String userPrompt, String engine) throws Exception {
        AgentOneShotRunner.ExecutionRequest request = new AgentOneShotRunner.ExecutionRequest(
                SYSTEM_PROMPT, userPrompt, null, null, engine,
                "low", "default", null, null, null, AgentOneShotRunner.TOOL_POLICY_DISABLED);
        FutureTask<String> task = new FutureTask<>(() -> runner.runOnce(request));
        Thread.ofVirtual().name("fore-consult-classify").start(task);
        try {
            return task.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            task.cancel(true);
            log.info("[fore-consult] 问题边界识别超过 {}ms，按追问放行", timeoutMs);
            throw e;
        } catch (InterruptedException e) {
            task.cancel(true);
            Thread.currentThread().interrupt();
            throw e;
        }
    }

    private static String normalizeEngine(String engine) {
        if ("claude".equalsIgnoreCase(engine)) return "claude";
        if ("codex".equalsIgnoreCase(engine)) return "codex";
        throw new IllegalArgumentException("业务咨询仅支持 claude 或 codex 引擎");
    }

    private static QuestionClassificationView fallback(String reason) {
        return new QuestionClassificationView(FOLLOW_UP, reason);
    }

    private static String truncate(String value, int maxLength) {
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private static String stripFence(String value) {
        String text = value;
        if (text.startsWith("```")) {
            int newline = text.indexOf('\n');
            if (newline >= 0) {
                text = text.substring(newline + 1);
            }
            if (text.endsWith("```")) {
                text = text.substring(0, text.length() - 3);
            }
        }
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        return start >= 0 && end > start ? text.substring(start, end + 1) : text;
    }
}
