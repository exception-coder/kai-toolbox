package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.assistant.domain.AssistantIntent;
import com.exceptioncoder.toolbox.assistant.domain.AssistantIntentResult;
import com.exceptioncoder.toolbox.assistant.domain.AssistantMessageClassification;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCategory;
import com.exceptioncoder.toolbox.common.requirement.RequirementType;
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
            同时判断 feedbackCategory：
            BUG：已有功能行为错误。
            REQUIREMENT：提出此前不存在的新能力。
            OPTIMIZATION：调整、改善或简化已有能力。
            NONE：不属于以上反馈。
            只输出 JSON：{"intent":"QUESTION|BUG|SUGGESTION|DIAGNOSE|UNKNOWN","feedbackCategory":"BUG|REQUIREMENT|OPTIMIZATION|NONE","confidence":0到1,"reason":"不超过40字"}
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
        return routeInternal(mode, text, "", false);
    }

    /** 基于历史反馈摘要严格分类当前增量消息，失败时抛错以阻止水位推进。 */
    public AssistantIntentResult routeWithContext(String mode, String text, String contextSummary) {
        return routeInternal(mode, text, contextSummary, true);
    }

    /** 基于历史摘要一次性返回对话意图和三类反馈映射。 */
    public AssistantMessageClassification classifyFeedbackWithContext(
            String text, String contextSummary) {
        String normalizedText = text == null ? "" : text.trim();
        if (normalizedText.isBlank()) {
            return noFeedback(fallback("没有可分类的用户输入"));
        }
        AgentOneShotRunner runner = runnerProvider.getIfAvailable();
        if (runner == null) {
            throw new IllegalStateException("意图识别引擎不可用");
        }
        String userPrompt = buildUserPrompt(normalizedText, contextSummary);
        FutureTask<String> task = new FutureTask<>(() -> runner.runOnce(new AgentOneShotRunner.ExecutionRequest(
                SYSTEM_PROMPT, userPrompt, null, null, "codex", "low", "default",
                null, null, null, AgentOneShotRunner.TOOL_POLICY_DISABLED)));
        Thread.ofVirtual().name("assistant-feedback-classify").start(task);
        try {
            return parseClassification(task.get(timeoutMs, TimeUnit.MILLISECONDS));
        } catch (TimeoutException exception) {
            task.cancel(true);
            throw classificationFailure("意图识别超时", exception);
        } catch (InterruptedException exception) {
            task.cancel(true);
            Thread.currentThread().interrupt();
            throw classificationFailure("意图识别被中断", exception);
        } catch (Exception exception) {
            throw classificationFailure("意图识别失败", exception);
        }
    }

    private AssistantIntentResult routeInternal(String mode, String text, String contextSummary,
                                                boolean strict) {
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
            return failure("意图识别引擎不可用", strict, null);
        }
        String userPrompt = buildUserPrompt(normalizedText, contextSummary);
        FutureTask<String> task = new FutureTask<>(() -> runner.runOnce(new AgentOneShotRunner.ExecutionRequest(
                SYSTEM_PROMPT, userPrompt, null, null, "codex", "low", "default",
                null, null, null, AgentOneShotRunner.TOOL_POLICY_DISABLED)));
        Thread.ofVirtual().name("assistant-intent-classify").start(task);
        try {
            return parse(task.get(timeoutMs, TimeUnit.MILLISECONDS));
        } catch (TimeoutException exception) {
            task.cancel(true);
            return failure("意图识别超时", strict, exception);
        } catch (InterruptedException exception) {
            task.cancel(true);
            Thread.currentThread().interrupt();
            return failure("意图识别被中断", strict, exception);
        } catch (Exception exception) {
            return failure("意图识别失败", strict, exception);
        }
    }

    private String buildUserPrompt(String text, String contextSummary) {
        String summary = contextSummary == null ? "" : contextSummary.trim();
        if (summary.isBlank()) {
            return "本次新增用户消息：\n" + text;
        }
        return "已确认的历史反馈摘要，仅用于理解指代，不得据此覆盖本次消息：\n"
                + summary + "\n\n本次新增用户消息，只分类这一段：\n" + text;
    }

    private AssistantIntentResult parse(String raw) throws Exception {
        JsonNode node = objectMapper.readTree(extractJson(raw));
        return parseIntent(node);
    }

    private AssistantMessageClassification parseClassification(String raw) throws Exception {
        JsonNode node = objectMapper.readTree(extractJson(raw));
        AssistantIntentResult intentResult = parseIntent(node);
        FeedbackCategory category = FeedbackCategory.valueOf(
                node.path("feedbackCategory").asText("").trim().toUpperCase(Locale.ROOT));
        RequirementType requirementType = switch (category) {
            case BUG -> RequirementType.BUG_FIX;
            case REQUIREMENT -> RequirementType.NEW_MODULE;
            case OPTIMIZATION -> RequirementType.MODULE_ADJUST;
            case NONE -> RequirementType.UNKNOWN;
        };
        validateClassification(intentResult.intent(), category);
        return new AssistantMessageClassification(intentResult, category, requirementType);
    }

    private AssistantIntentResult parseIntent(JsonNode node) {
        AssistantIntent intent = AssistantIntent.valueOf(node.path("intent").asText("").trim().toUpperCase(Locale.ROOT));
        double confidence = node.path("confidence").asDouble(-1D);
        if (confidence < 0D || confidence > 1D) {
            throw new IllegalArgumentException("confidence 超出 0..1");
        }
        String reason = node.path("reason").asText("").trim();
        if (reason.length() > 80) reason = reason.substring(0, 80);
        return new AssistantIntentResult(intent, confidence, reason.isBlank() ? "模型未提供分类依据" : reason);
    }

    private void validateClassification(AssistantIntent intent, FeedbackCategory category) {
        if (category == FeedbackCategory.BUG && intent != AssistantIntent.BUG) {
            throw new IllegalArgumentException("BUG 反馈必须映射为 BUG 意图");
        }
        if ((category == FeedbackCategory.REQUIREMENT || category == FeedbackCategory.OPTIMIZATION)
                && intent != AssistantIntent.SUGGESTION) {
            throw new IllegalArgumentException("需求或优化反馈必须映射为 SUGGESTION 意图");
        }
    }

    private AssistantMessageClassification noFeedback(AssistantIntentResult result) {
        return new AssistantMessageClassification(result, FeedbackCategory.NONE, RequirementType.UNKNOWN);
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

    private AssistantIntentResult failure(String reason, boolean strict, Exception exception) {
        if (exception != null) {
            log.warn("[assistant] {}", reason, exception);
        }
        if (strict) {
            throw new IllegalStateException(reason, exception);
        }
        return fallback(reason);
    }

    private IllegalStateException classificationFailure(String reason, Exception exception) {
        log.warn("[assistant] {}", reason, exception);
        return new IllegalStateException(reason, exception);
    }
}
