package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.assistant.domain.AssistantIntent;
import com.exceptioncoder.toolbox.assistant.domain.AssistantIntentResult;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** 显式模式优先的 Assistant 意图路由。 */
@Service
public class AssistantIntentRouter {

    private static final Logger log = LoggerFactory.getLogger(AssistantIntentRouter.class);
    private static final double EXPLICIT_CONFIDENCE = 1.0D;
    private static final String SYSTEM_PROMPT = """
            你是企业内部嵌入式助手的意图分类器。只能从以下封闭枚举选择一个：
            QUESTION：询问业务含义、规则、操作方法或状态解释。
            BUG：报告错误、失败、异常或已有功能行为不正确。
            SUGGESTION：提出新增能力、体验改进或流程优化诉求。
            DIAGNOSE：要求基于证据排查原因、定位故障或给出调查路径。
            UNKNOWN：证据不足或无法可靠分类。
            只输出 JSON：{"intent":"QUESTION|BUG|SUGGESTION|DIAGNOSE|UNKNOWN","confidence":0到1,"reason":"不超过40字"}
            """;

    private final ObjectProvider<AgentOneShotRunner> runnerProvider;
    private final ObjectMapper objectMapper;
    private final long timeoutMs;

    public AssistantIntentRouter(ObjectProvider<AgentOneShotRunner> runnerProvider,
                                 ObjectMapper objectMapper,
                                 @Value("${toolbox.assistant.intent-timeout-ms:12000}") long timeoutMs) {
        this.runnerProvider = runnerProvider;
        this.objectMapper = objectMapper;
        this.timeoutMs = Math.max(100L, timeoutMs);
    }

    /** 路由显式模式，AUTO 时调用受控枚举分类器并校验模型输出。 */
    public AssistantIntentResult route(String mode, String text) {
        String normalizedMode = mode == null ? "AUTO" : mode.trim().toUpperCase(Locale.ROOT);
        if (!"AUTO".equals(normalizedMode)) {
            try {
                return new AssistantIntentResult(
                        AssistantIntent.valueOf(normalizedMode), EXPLICIT_CONFIDENCE, "用户显式选择模式");
            } catch (IllegalArgumentException ignored) {
                return new AssistantIntentResult(AssistantIntent.UNKNOWN, 0D, "无法识别的显式模式");
            }
        }
        String normalizedText = text == null ? "" : text.trim();
        if (normalizedText.isBlank()) {
            return fallback("没有可分类的用户输入");
        }
        AgentOneShotRunner runner = runnerProvider.getIfAvailable();
        if (runner == null) {
            return fallback("意图识别引擎不可用");
        }
        FutureTask<String> task = new FutureTask<>(() -> runner.runOnce(new AgentOneShotRunner.ExecutionRequest(
                SYSTEM_PROMPT, normalizedText, null, null, "codex", "low", "default",
                null, null, null, AgentOneShotRunner.TOOL_POLICY_DISABLED)));
        Thread.ofVirtual().name("assistant-intent-classify").start(task);
        try {
            return parse(task.get(timeoutMs, TimeUnit.MILLISECONDS));
        } catch (TimeoutException exception) {
            task.cancel(true);
            return fallback("意图识别超时");
        } catch (InterruptedException exception) {
            task.cancel(true);
            Thread.currentThread().interrupt();
            return fallback("意图识别被中断");
        } catch (Exception exception) {
            log.warn("[assistant] 意图识别失败: {}", exception.getMessage());
            return fallback("意图识别失败");
        }
    }

    private AssistantIntentResult parse(String raw) throws Exception {
        JsonNode node = objectMapper.readTree(extractJson(raw));
        AssistantIntent intent = AssistantIntent.valueOf(node.path("intent").asText("").trim().toUpperCase(Locale.ROOT));
        double confidence = node.path("confidence").asDouble(-1D);
        if (confidence < 0D || confidence > 1D) {
            throw new IllegalArgumentException("confidence 超出 0..1");
        }
        String reason = node.path("reason").asText("").trim();
        if (reason.length() > 80) reason = reason.substring(0, 80);
        return new AssistantIntentResult(intent, confidence, reason.isBlank() ? "模型未提供分类依据" : reason);
    }

    private static String extractJson(String raw) {
        String value = raw == null ? "" : raw.trim();
        int start = value.indexOf('{');
        int end = value.lastIndexOf('}');
        return start >= 0 && end > start ? value.substring(start, end + 1) : value;
    }

    private static AssistantIntentResult fallback(String reason) {
        return new AssistantIntentResult(AssistantIntent.UNKNOWN, 0D, reason);
    }
}
