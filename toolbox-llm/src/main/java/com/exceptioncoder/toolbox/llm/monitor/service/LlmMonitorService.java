package com.exceptioncoder.toolbox.llm.monitor.service;

import com.exceptioncoder.toolbox.llm.config.LlmProperties;
import com.exceptioncoder.toolbox.llm.monitor.LlmMetricsRegistry;
import com.exceptioncoder.toolbox.llm.monitor.dto.CallFilter;
import com.exceptioncoder.toolbox.llm.monitor.dto.CallRow;
import com.exceptioncoder.toolbox.llm.monitor.dto.GroupStat;
import com.exceptioncoder.toolbox.llm.monitor.dto.PageResult;
import com.exceptioncoder.toolbox.llm.monitor.dto.QuotaSnapshot;
import com.exceptioncoder.toolbox.llm.monitor.dto.SummaryResult;
import com.exceptioncoder.toolbox.llm.monitor.dto.TimeseriesResult;
import com.exceptioncoder.toolbox.llm.monitor.dto.Totals;
import com.exceptioncoder.toolbox.llm.monitor.dto.TsPoint;
import com.exceptioncoder.toolbox.llm.monitor.repository.LlmCallLogRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

/**
 * 监控聚合编排：历史聚合走 {@link LlmCallLogRepository}（SQL GROUP BY），实时水位走 {@link LlmMetricsRegistry}。
 * 入参枚举在此白名单校验，非法即抛 IllegalArgumentException（交全局异常处理转 400）。
 */
@Service
public class LlmMonitorService {

    private final LlmCallLogRepository repository;
    private final LlmMetricsRegistry registry;
    private final LlmProperties props;
    private final ZoneId zone = ZoneId.systemDefault();

    public LlmMonitorService(LlmCallLogRepository repository, LlmMetricsRegistry registry, LlmProperties props) {
        this.repository = repository;
        this.registry = registry;
        this.props = props;
    }

    public SummaryResult summary(Long fromMs, Long toMs, String groupBy) {
        long[] range = resolveRange(fromMs, toMs);
        String groupCol = switch (groupBy == null ? "model" : groupBy) {
            case "model" -> "model_id";
            case "tier" -> "tier";
            case "tool" -> "tool_id";
            default -> throw new IllegalArgumentException("groupBy 仅支持 model/tier/tool: " + groupBy);
        };
        double[] costLat = new double[2];
        long[] t = repository.totals(range[0], range[1], costLat);
        long calls = t[0];
        double errorRate = calls == 0 ? 0 : (double) t[4] / calls;
        Totals totals = new Totals(calls, t[1], t[2], t[3], costLat[0],
                props.getMonitor().getCurrency(), errorRate, Math.round(costLat[1]));
        List<GroupStat> groups = repository.groups(range[0], range[1], groupCol);
        return new SummaryResult(toIso(range[0]), toIso(range[1]), totals, groups);
    }

    public TimeseriesResult timeseries(Long fromMs, Long toMs, String bucket, String metric) {
        long[] range = resolveRange(fromMs, toMs);
        String b = bucket == null ? "hour" : bucket;
        int bucketLen = switch (b) {
            case "hour" -> 13;
            case "day" -> 10;
            default -> throw new IllegalArgumentException("bucket 仅支持 hour/day: " + bucket);
        };
        String m = metric == null ? "tokens" : metric;
        String metricExpr = switch (m) {
            case "tokens" -> "COALESCE(SUM(total_tokens),0)";
            case "calls" -> "COUNT(*)";
            case "cost" -> "COALESCE(SUM(cost),0)";
            case "errors" -> "COALESCE(SUM(CASE WHEN status='error' THEN 1 ELSE 0 END),0)";
            default -> throw new IllegalArgumentException("metric 仅支持 tokens/calls/cost/errors: " + metric);
        };
        List<TsPoint> points = repository.timeseries(range[0], range[1], bucketLen, metricExpr);
        return new TimeseriesResult(b, m, points);
    }

    public PageResult<CallRow> calls(CallFilter filter, int page, int size) {
        int p = Math.max(0, page);
        int s = Math.min(Math.max(1, size), 200);
        long total = repository.countCalls(filter);
        List<CallRow> items = repository.calls(filter, p * s, s);
        return new PageResult<>(p, s, total, items);
    }

    public List<CallRow> slow(Long fromMs, Long toMs, int limit) {
        long[] range = resolveRange(fromMs, toMs);
        int l = Math.min(Math.max(1, limit), 100);
        return repository.slow(range[0], range[1], l);
    }

    public QuotaSnapshot quota() {
        return new QuotaSnapshot("day", props.getMonitor().getCurrency(),
                registry.snapshotQuota(props.getMonitor()));
    }

    /** 解析时间区间：缺省=今日 00:00 → 现在。 */
    private long[] resolveRange(Long fromMs, Long toMs) {
        long now = Instant.now().toEpochMilli();
        long from = fromMs != null ? fromMs
                : LocalDate.now(zone).atStartOfDay(zone).toInstant().toEpochMilli();
        long to = toMs != null ? toMs : now;
        return new long[]{from, to};
    }

    private String toIso(long ms) {
        return Instant.ofEpochMilli(ms).atZone(zone).toOffsetDateTime().toString();
    }
}
