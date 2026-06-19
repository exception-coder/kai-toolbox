package com.exceptioncoder.toolbox.claudechat.service.usage;

import com.exceptioncoder.toolbox.claudechat.api.dto.EngineUsageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.EngineUsageView.QuotaView;
import com.exceptioncoder.toolbox.claudechat.api.dto.EngineUsageView.WindowStat;
import com.exceptioncoder.toolbox.claudechat.service.usage.EngineUsageScanner.QuotaSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.usage.EngineUsageScanner.ScanResult;
import com.exceptioncoder.toolbox.claudechat.service.usage.EngineUsageScanner.TurnRecord;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 引擎本地用量聚合：并行扫各引擎日志，按 今日/近7天/近30天 聚合 token 与轮次，60s 内存缓存。
 */
@Slf4j
@Service("claudeChatUsageService")
public class UsageService {

    private static final long DAY = 86_400_000L;
    private static final long TTL_MS = 60_000L;

    private final List<EngineUsageScanner> scanners;
    private volatile long cachedAt;
    private volatile List<EngineUsageView> cache;

    public UsageService(List<EngineUsageScanner> scanners) {
        this.scanners = scanners;
    }

    public synchronized List<EngineUsageView> usage() {
        long now = System.currentTimeMillis();
        if (cache != null && now - cachedAt < TTL_MS) {
            return cache;
        }
        long todayStart = LocalDate.now(ZoneId.systemDefault())
                .atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
        long d7Start = now - 7 * DAY;
        long d30Start = now - 30 * DAY;

        List<EngineUsageView> result = new ArrayList<>(scanners.size());
        for (EngineUsageScanner s : scanners) {
            result.add(build(s, todayStart, d7Start, d30Start));
        }
        cache = result;
        cachedAt = now;
        return result;
    }

    private EngineUsageView build(EngineUsageScanner s, long todayStart, long d7Start, long d30Start) {
        String engine = s.engine();
        boolean hasTokens = !"gemini".equals(engine);
        String note = hasTokens ? null : "本地无 token 记录，仅统计会话 / 消息数";
        ScanResult r;
        try {
            r = s.scan(d30Start);
        } catch (Exception e) {
            log.debug("[usage] 扫描 {} 失败：{}", engine, e.toString());
            return new EngineUsageView(engine, false, hasTokens, "扫描失败",
                    WindowStat.empty(), WindowStat.empty(), WindowStat.empty(), null);
        }
        if (r == null) r = ScanResult.empty();

        Agg today = new Agg();
        Agg d7 = new Agg();
        Agg d30 = new Agg();
        for (TurnRecord t : r.records()) {
            d30.add(t);
            if (t.ts() >= d7Start) d7.add(t);
            if (t.ts() >= todayStart) today.add(t);
        }
        boolean available = !r.records().isEmpty() || r.quota() != null;
        return new EngineUsageView(engine, available, hasTokens, available ? note : "近 30 天无本地记录（或未安装该引擎）",
                today.stat(), d7.stat(), d30.stat(), toQuotaView(r.quota()));
    }

    private QuotaView toQuotaView(QuotaSnapshot q) {
        if (q == null) return null;
        return new QuotaView(q.primaryUsedPercent(), q.primaryWindowMinutes(), q.primaryResetsAt(),
                q.secondaryUsedPercent(), q.secondaryWindowMinutes(), q.secondaryResetsAt(), q.planType());
    }

    /** 单窗口累加器。 */
    private static final class Agg {
        long in, out, cr, cc;
        int turns;
        final Set<String> sids = new HashSet<>();

        void add(TurnRecord t) {
            in += t.input();
            out += t.output();
            cr += t.cacheRead();
            cc += t.cacheCreate();
            turns++;
            if (t.sessionId() != null) sids.add(t.sessionId());
        }

        WindowStat stat() {
            long total = in + out + cr + cc;
            long inputSide = in + cr + cc;
            Double hit = inputSide > 0 ? (double) cr / inputSide : null;
            return new WindowStat(in, out, cr, cc, total, turns, sids.size(), hit);
        }
    }
}
