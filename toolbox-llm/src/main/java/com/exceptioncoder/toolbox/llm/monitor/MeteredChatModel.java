package com.exceptioncoder.toolbox.llm.monitor;

import com.exceptioncoder.toolbox.llm.model.ModelSpec;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.model.ModelProvider;
import dev.langchain4j.model.chat.Capability;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.ChatRequestParameters;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.output.TokenUsage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * 计量装饰器：包裹单个真实 ChatModel，网关监控的核心采集点。
 *
 * <p>每次 chat()：计时 → 调 delegate → 从 ChatResponse 取 TokenUsage/finishReason → 组装 {@link LlmCallEvent}
 * → 异步提交。失败时落 error 事件后原样 rethrow。所有采集逻辑 try/catch 隔离，绝不影响业务结果与路由行为。
 * 能力/参数/provider 元信息委托给 delegate，保证结构化输出探测正常。
 */
public class MeteredChatModel implements ChatModel {

    private static final Logger log = LoggerFactory.getLogger(MeteredChatModel.class);
    private static final int ERR_MSG_MAX = 500;

    private final ModelSpec spec;
    private final ChatModel delegate;
    private final LlmMetricsRecorder recorder;
    private final LlmCostCalculator costCalculator;
    private final LlmTokenEstimator estimator;

    public MeteredChatModel(ModelSpec spec, ChatModel delegate, LlmMetricsRecorder recorder,
                            LlmCostCalculator costCalculator, LlmTokenEstimator estimator) {
        this.spec = spec;
        this.delegate = delegate;
        this.recorder = recorder;
        this.costCalculator = costCalculator;
        this.estimator = estimator;
    }

    @Override
    public ChatResponse chat(ChatRequest chatRequest) {
        int attempt = LlmCallAttempt.next();
        Instant now = Instant.now();
        long t0 = System.nanoTime();
        int requestChars = requestChars(chatRequest);
        try {
            ChatResponse resp = delegate.chat(chatRequest);
            safeRecordSuccess(now, attempt, requestChars, elapsedMs(t0), resp);
            return resp;
        } catch (RuntimeException ex) {
            safeRecordError(now, attempt, requestChars, elapsedMs(t0), ex);
            throw ex;
        }
    }

    private void safeRecordSuccess(Instant now, int attempt, int requestChars, long latencyMs, ChatResponse resp) {
        try {
            TokenUsage usage = resp.tokenUsage();
            Integer in = usage == null ? null : usage.inputTokenCount();
            Integer out = usage == null ? null : usage.outputTokenCount();
            Integer total = usage == null ? null : usage.totalTokenCount();
            int responseChars = responseChars(resp);
            boolean estimated = false;
            if (in == null && out == null && total == null) {
                estimated = true;
                in = estimator.estimate(requestChars);
                out = estimator.estimate(responseChars);
                total = in + out;
            } else if (total == null) {
                total = (in == null ? 0 : in) + (out == null ? 0 : out);
            }
            double cost = costCalculator.cost(spec, in, out);
            String finishReason = resp.finishReason() == null ? null : resp.finishReason().name();
            String modelName = resp.modelName() != null ? resp.modelName() : spec.getModel();
            LlmCallContext.Attribution attr = LlmCallContext.current();
            recorder.submit(new LlmCallEvent(
                    UUID.randomUUID().toString(), now.toString(), now.toEpochMilli(),
                    spec.getTier(), spec.getId(), modelName,
                    attr == null ? null : attr.toolId(), attr == null ? null : attr.agent(),
                    attr == null ? null : attr.stage(),
                    in, out, total, estimated, cost, latencyMs,
                    LlmCallEvent.STATUS_SUCCESS, finishReason, attempt,
                    null, null, requestChars, responseChars));
        } catch (Exception ex) {
            log.warn("[toolbox-llm] 成功调用计量失败（忽略，不影响业务）: {}", ex.toString());
        }
    }

    private void safeRecordError(Instant now, int attempt, int requestChars, long latencyMs, RuntimeException error) {
        try {
            LlmCallContext.Attribution attr = LlmCallContext.current();
            recorder.submit(new LlmCallEvent(
                    UUID.randomUUID().toString(), now.toString(), now.toEpochMilli(),
                    spec.getTier(), spec.getId(), spec.getModel(),
                    attr == null ? null : attr.toolId(), attr == null ? null : attr.agent(),
                    attr == null ? null : attr.stage(),
                    null, null, null, false, 0.0, latencyMs,
                    LlmCallEvent.STATUS_ERROR, null, attempt,
                    error.getClass().getName(), truncate(error.getMessage()),
                    requestChars, 0));
        } catch (Exception ex) {
            log.warn("[toolbox-llm] 失败调用计量失败（忽略）: {}", ex.toString());
        }
    }

    private static long elapsedMs(long startNanos) {
        return (System.nanoTime() - startNanos) / 1_000_000L;
    }

    private static int requestChars(ChatRequest request) {
        int n = 0;
        try {
            List<ChatMessage> messages = request.messages();
            if (messages != null) {
                for (ChatMessage m : messages) {
                    if (m != null) {
                        n += String.valueOf(m).length();
                    }
                }
            }
        } catch (Exception ignore) {
            // 入参摘要仅用于估算，取不到不致命
        }
        return n;
    }

    private static int responseChars(ChatResponse resp) {
        try {
            if (resp.aiMessage() != null && resp.aiMessage().text() != null) {
                return resp.aiMessage().text().length();
            }
        } catch (Exception ignore) {
            // 同上
        }
        return 0;
    }

    private static String truncate(String s) {
        if (s == null) {
            return null;
        }
        return s.length() <= ERR_MSG_MAX ? s : s.substring(0, ERR_MSG_MAX);
    }

    // ---- 元信息委托给 delegate ----

    @Override
    public Set<Capability> supportedCapabilities() {
        return delegate.supportedCapabilities();
    }

    @Override
    public ChatRequestParameters defaultRequestParameters() {
        return delegate.defaultRequestParameters();
    }

    @Override
    public ModelProvider provider() {
        return delegate.provider();
    }
}
