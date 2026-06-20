package com.exceptioncoder.toolbox.llm.monitor;

import com.exceptioncoder.toolbox.llm.config.MonitorProperties;
import dev.langchain4j.model.chat.Capability;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.ChatRequestParameters;
import dev.langchain4j.model.chat.response.ChatResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/**
 * 配额闸门装饰器：包裹整个 tier 的路由模型，调用前做 tier 维度配额准入。
 *
 * <p>同时作为「单次顶层调用」的边界——进入路由前 {@link LlmCallAttempt#reset()}，使故障转移链上
 * 每次尝试拿到递增 attempt（RoutingChatModel 保持零改动）。
 *
 * <p>超软阈值仅 WARN；超硬上限抛 {@link LlmQuotaExceededException} 并落 quota_blocked 记录，
 * 不进入路由、不触发故障转移。未配置该 tier 配额时纯透传。
 */
public class QuotaGuardChatModel implements ChatModel {

    private static final Logger log = LoggerFactory.getLogger(QuotaGuardChatModel.class);

    private final String tier;
    private final ChatModel delegate;
    private final LlmMetricsRegistry registry;
    private final LlmMetricsRecorder recorder;
    private final MonitorProperties props;

    public QuotaGuardChatModel(String tier, ChatModel delegate, LlmMetricsRegistry registry,
                               LlmMetricsRecorder recorder, MonitorProperties props) {
        this.tier = tier;
        this.delegate = delegate;
        this.registry = registry;
        this.recorder = recorder;
        this.props = props;
    }

    @Override
    public ChatResponse chat(ChatRequest chatRequest) {
        LlmCallAttempt.reset();
        MonitorProperties.QuotaRule rule = findTierRule();
        if (rule != null) {
            LlmMetricsRegistry.Counter used = registry.tierUsage(tier);
            if (hardExceeded(rule, used)) {
                String reason = "tier=" + tier + " 当日配额已达上限（tokens=" + used.tokens()
                        + ", calls=" + used.calls() + "）";
                recordBlocked(reason);
                log.warn("[toolbox-llm] 配额拒绝：{}", reason);
                throw new LlmQuotaExceededException(reason);
            }
            warnIfSoft(rule, used);
        }
        return delegate.chat(chatRequest);
    }

    private MonitorProperties.QuotaRule findTierRule() {
        for (MonitorProperties.QuotaRule r : props.getQuotas()) {
            if (!"model".equalsIgnoreCase(r.getScope()) && tier.equals(r.getKey())) {
                return r;
            }
        }
        return null;
    }

    private static boolean hardExceeded(MonitorProperties.QuotaRule rule, LlmMetricsRegistry.Counter used) {
        if (rule.getDailyTokenLimit() != null && used.tokens() >= rule.getDailyTokenLimit()) {
            return true;
        }
        return rule.getDailyCallLimit() != null && used.calls() >= rule.getDailyCallLimit();
    }

    private void warnIfSoft(MonitorProperties.QuotaRule rule, LlmMetricsRegistry.Counter used) {
        double soft = props.getSoftThreshold();
        if (rule.getDailyTokenLimit() != null
                && (double) used.tokens() / rule.getDailyTokenLimit() >= soft) {
            log.warn("[toolbox-llm] 配额告警：tier={} token 已达 {}% ({}/{})",
                    tier, Math.round(100.0 * used.tokens() / rule.getDailyTokenLimit()),
                    used.tokens(), rule.getDailyTokenLimit());
        }
        if (rule.getDailyCallLimit() != null
                && (double) used.calls() / rule.getDailyCallLimit() >= soft) {
            log.warn("[toolbox-llm] 配额告警：tier={} 调用数已达 {}% ({}/{})",
                    tier, Math.round(100.0 * used.calls() / rule.getDailyCallLimit()),
                    used.calls(), rule.getDailyCallLimit());
        }
    }

    private void recordBlocked(String reason) {
        try {
            Instant now = Instant.now();
            recorder.submit(new LlmCallEvent(
                    UUID.randomUUID().toString(), now.toString(), now.toEpochMilli(),
                    tier, "(quota)", null, null, null, null,
                    0, 0, 0, false, 0.0, 0L,
                    LlmCallEvent.STATUS_QUOTA_BLOCKED, null, 1,
                    LlmQuotaExceededException.class.getName(), reason, 0, 0));
        } catch (Exception ex) {
            log.warn("[toolbox-llm] 记录 quota_blocked 失败（忽略）: {}", ex.toString());
        }
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
    public dev.langchain4j.model.ModelProvider provider() {
        return delegate.provider();
    }
}
