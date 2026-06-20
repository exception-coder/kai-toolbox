package com.exceptioncoder.toolbox.llm.monitor;

import com.exceptioncoder.toolbox.llm.config.MonitorProperties;
import com.exceptioncoder.toolbox.llm.monitor.dto.CallRow;
import com.exceptioncoder.toolbox.llm.monitor.dto.QuotaStatus;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 内存滚动窗口计数（按自然日）：供配额闸门做准入判定 + 仪表盘实时水位。
 *
 * <p>跨天自动重置；进程重启由 {@link LlmMetricsRecorder} 启动时从 DB 回填当日数据重建。
 * 仅累加实际消费（success/error），{@code quota_blocked} 不计入用量。
 */
@Component
public class LlmMetricsRegistry {

    /** 一个维度键的当日累计。 */
    public static final class Counter {
        private final AtomicLong tokens = new AtomicLong();
        private final AtomicLong calls = new AtomicLong();
        private final AtomicLong errors = new AtomicLong();

        public long tokens() {
            return tokens.get();
        }

        public long calls() {
            return calls.get();
        }

        public long errors() {
            return errors.get();
        }
    }

    private final ZoneId zone = ZoneId.systemDefault();
    private volatile LocalDate currentDay = LocalDate.now(zone);

    private final Map<String, Counter> tiers = new ConcurrentHashMap<>();
    private final Map<String, Counter> models = new ConcurrentHashMap<>();
    private final Map<String, Counter> tools = new ConcurrentHashMap<>();
    private final AtomicLong dropped = new AtomicLong();

    public void add(LlmCallEvent e) {
        if (LlmCallEvent.STATUS_QUOTA_BLOCKED.equals(e.status())) {
            return;
        }
        boolean error = LlmCallEvent.STATUS_ERROR.equals(e.status());
        accumulate(e.tier(), e.modelId(), e.toolId(), e.totalTokensOrZero(), error);
    }

    /** 启动回填：用当日历史记录重建水位。 */
    public void warmup(List<CallRow> rows) {
        for (CallRow r : rows) {
            if (LlmCallEvent.STATUS_QUOTA_BLOCKED.equals(r.status())) {
                continue;
            }
            boolean error = LlmCallEvent.STATUS_ERROR.equals(r.status());
            int tokens = r.totalTokens() == null ? 0 : r.totalTokens();
            accumulate(r.tier(), r.modelId(), r.toolId(), tokens, error);
        }
    }

    private void accumulate(String tier, String modelId, String toolId, long tokens, boolean error) {
        rollIfNeeded();
        bump(counter(tiers, tier), tokens, error);
        bump(counter(models, modelId), tokens, error);
        if (toolId != null && !toolId.isBlank()) {
            bump(counter(tools, toolId), tokens, error);
        }
    }

    private static void bump(Counter c, long tokens, boolean error) {
        if (c == null) {
            return;
        }
        c.tokens.addAndGet(tokens);
        c.calls.incrementAndGet();
        if (error) {
            c.errors.incrementAndGet();
        }
    }

    private static Counter counter(Map<String, Counter> map, String key) {
        if (key == null) {
            return null;
        }
        return map.computeIfAbsent(key, k -> new Counter());
    }

    /** tier 维度当日用量（供配额闸门）。 */
    public Counter tierUsage(String tier) {
        rollIfNeeded();
        return counter(tiers, tier == null ? "*" : tier);
    }

    /** model 维度当日用量（供配额闸门）。 */
    public Counter modelUsage(String modelId) {
        rollIfNeeded();
        return counter(models, modelId);
    }

    public void incDropped() {
        dropped.incrementAndGet();
    }

    public long droppedCount() {
        return dropped.get();
    }

    /** 配额水位快照：每条配置规则一行，再补未配规则的活跃 tier 为 unlimited。 */
    public List<QuotaStatus> snapshotQuota(MonitorProperties props) {
        rollIfNeeded();
        List<QuotaStatus> out = new ArrayList<>();
        Set<String> coveredTiers = new HashSet<>();
        double soft = props.getSoftThreshold();
        for (MonitorProperties.QuotaRule rule : props.getQuotas()) {
            boolean tierScope = !"model".equalsIgnoreCase(rule.getScope());
            Counter c = tierScope ? counter(tiers, rule.getKey()) : counter(models, rule.getKey());
            long tokensUsed = c == null ? 0 : c.tokens();
            long callsUsed = c == null ? 0 : c.calls();
            Long tokenLimit = rule.getDailyTokenLimit();
            Integer callLimit = rule.getDailyCallLimit();
            Double tokenRatio = tokenLimit == null ? null : (double) tokensUsed / tokenLimit;
            Double callRatio = callLimit == null ? null : (double) callsUsed / callLimit;
            out.add(new QuotaStatus(tierScope ? "tier" : "model", rule.getKey(),
                    tokensUsed, tokenLimit, tokenRatio, callsUsed, callLimit, callRatio,
                    soft, stateOf(tokenRatio, callRatio, soft)));
            if (tierScope) {
                coveredTiers.add(rule.getKey());
            }
        }
        for (Map.Entry<String, Counter> e : tiers.entrySet()) {
            if (!coveredTiers.contains(e.getKey())) {
                out.add(new QuotaStatus("tier", e.getKey(), e.getValue().tokens(), null, null,
                        e.getValue().calls(), null, null, soft, QuotaStatus.STATE_UNLIMITED));
            }
        }
        return out;
    }

    private static String stateOf(Double tokenRatio, Double callRatio, double soft) {
        double max = Math.max(tokenRatio == null ? 0 : tokenRatio, callRatio == null ? 0 : callRatio);
        if (tokenRatio == null && callRatio == null) {
            return QuotaStatus.STATE_UNLIMITED;
        }
        if (max >= 1.0) {
            return QuotaStatus.STATE_EXCEEDED;
        }
        if (max >= soft) {
            return QuotaStatus.STATE_WARN;
        }
        return QuotaStatus.STATE_OK;
    }

    private synchronized void rollIfNeeded() {
        LocalDate today = LocalDate.now(zone);
        if (!today.equals(currentDay)) {
            tiers.clear();
            models.clear();
            tools.clear();
            currentDay = today;
        }
    }
}
