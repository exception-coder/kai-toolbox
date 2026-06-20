package com.exceptioncoder.toolbox.llm.monitor;

import com.exceptioncoder.toolbox.llm.model.ModelSpec;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.model.chat.listener.ChatModelErrorContext;
import dev.langchain4j.model.chat.listener.ChatModelListener;
import dev.langchain4j.model.chat.listener.ChatModelRequestContext;
import dev.langchain4j.model.chat.listener.ChatModelResponseContext;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.output.TokenUsage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 基于 LangChain4j 原生 {@link ChatModelListener} 的计量采集——网关监控的核心采集点。
 *
 * <p>每个池成员（一个 OpenAiChatModel）在 build 时挂一个绑定其 {@link ModelSpec} 的本监听器实例。
 * onRequest 记起点 + attempt（存入 per-call attributes），onResponse/onError 取出算耗时、token、成本，
 * 组装 {@link LlmCallEvent} 异步提交。采集异常全部隔离，绝不影响业务结果与路由/熔断。
 *
 * <p>故障转移：RoutingChatModel 每次尝试调用某成员的 chat()，即触发该成员监听器，因此失败链上
 * 每次尝试各落一条记录（attempt 递增，由 {@link QuotaGuardChatModel} 在每次顶层调用前重置）。
 */
public class LlmMonitorListener implements ChatModelListener {

    private static final Logger log = LoggerFactory.getLogger(LlmMonitorListener.class);
    private static final int ERR_MSG_MAX = 500;

    private static final String K_START = "toolbox.llm.monitor.startNanos";
    private static final String K_ATTEMPT = "toolbox.llm.monitor.attempt";
    private static final String K_ATTR = "toolbox.llm.monitor.attr";

    private final ModelSpec spec;
    private final LlmMetricsRecorder recorder;
    private final LlmCostCalculator costCalculator;
    private final LlmTokenEstimator estimator;

    public LlmMonitorListener(ModelSpec spec, LlmMetricsRecorder recorder,
                              LlmCostCalculator costCalculator, LlmTokenEstimator estimator) {
        this.spec = spec;
        this.recorder = recorder;
        this.costCalculator = costCalculator;
        this.estimator = estimator;
    }

    @Override
    public void onRequest(ChatModelRequestContext ctx) {
        try {
            Map<Object, Object> a = ctx.attributes();
            a.put(K_START, System.nanoTime());
            a.put(K_ATTEMPT, LlmCallAttempt.next());
            a.put(K_ATTR, LlmCallContext.current());
        } catch (Exception ex) {
            log.warn("[toolbox-llm] 监控 onRequest 失败（忽略）: {}", ex.toString());
        }
    }

    @Override
    public void onResponse(ChatModelResponseContext ctx) {
        try {
            Map<Object, Object> a = ctx.attributes();
            long latencyMs = elapsedMs(a);
            int attempt = attempt(a);
            LlmCallContext.Attribution attr = attr(a);
            ChatResponse resp = ctx.chatResponse();

            TokenUsage usage = resp.tokenUsage();
            Integer in = usage == null ? null : usage.inputTokenCount();
            Integer out = usage == null ? null : usage.outputTokenCount();
            Integer total = usage == null ? null : usage.totalTokenCount();
            int requestChars = requestChars(ctx.chatRequest());
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

            Instant now = Instant.now();
            recorder.submit(new LlmCallEvent(
                    UUID.randomUUID().toString(), now.toString(), now.toEpochMilli(),
                    spec.getTier(), spec.getId(), modelName,
                    attr == null ? null : attr.toolId(), attr == null ? null : attr.agent(),
                    attr == null ? null : attr.stage(),
                    in, out, total, estimated, cost, latencyMs,
                    LlmCallEvent.STATUS_SUCCESS, finishReason, attempt,
                    null, null, requestChars, responseChars));
        } catch (Exception ex) {
            log.warn("[toolbox-llm] 监控 onResponse 计量失败（忽略，不影响业务）: {}", ex.toString());
        }
    }

    @Override
    public void onError(ChatModelErrorContext ctx) {
        try {
            Map<Object, Object> a = ctx.attributes();
            long latencyMs = elapsedMs(a);
            int attempt = attempt(a);
            LlmCallContext.Attribution attr = attr(a);
            Throwable error = ctx.error();
            int requestChars = requestChars(ctx.chatRequest());

            Instant now = Instant.now();
            recorder.submit(new LlmCallEvent(
                    UUID.randomUUID().toString(), now.toString(), now.toEpochMilli(),
                    spec.getTier(), spec.getId(), spec.getModel(),
                    attr == null ? null : attr.toolId(), attr == null ? null : attr.agent(),
                    attr == null ? null : attr.stage(),
                    null, null, null, false, 0.0, latencyMs,
                    LlmCallEvent.STATUS_ERROR, null, attempt,
                    error == null ? null : error.getClass().getName(),
                    error == null ? null : truncate(error.getMessage()),
                    requestChars, 0));
        } catch (Exception ex) {
            log.warn("[toolbox-llm] 监控 onError 计量失败（忽略）: {}", ex.toString());
        }
    }

    private static long elapsedMs(Map<Object, Object> a) {
        Object start = a.get(K_START);
        if (start instanceof Long s) {
            return (System.nanoTime() - s) / 1_000_000L;
        }
        return 0L;
    }

    private static int attempt(Map<Object, Object> a) {
        Object v = a.get(K_ATTEMPT);
        return v instanceof Integer i ? i : 1;
    }

    private static LlmCallContext.Attribution attr(Map<Object, Object> a) {
        Object v = a.get(K_ATTR);
        return v instanceof LlmCallContext.Attribution at ? at : null;
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
            // 摘要仅用于估算，取不到不致命
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
}
