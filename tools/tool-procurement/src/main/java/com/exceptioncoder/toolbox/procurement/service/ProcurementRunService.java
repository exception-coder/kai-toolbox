package com.exceptioncoder.toolbox.procurement.service;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementCollector;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementStore;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementCacheStore;
import org.springframework.core.task.VirtualThreadTaskExecutor;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;
import static com.exceptioncoder.toolbox.procurement.domain.ProcurementData.*;

/** 单批顺序采集避免站点压力；每条结果独立持久化，失败不影响后续来源。 */
@Service
public class ProcurementRunService {
    private final ProcurementStore store;
    private final ProcurementCollector collector;
    private final ProcurementParsingService parsing;
    private final ProcurementCacheStore cache;
    private final ProcurementRuleGroupService groups;
    private final AtomicBoolean running = new AtomicBoolean();
    private final VirtualThreadTaskExecutor executor = new VirtualThreadTaskExecutor("procurement-run-");

    public ProcurementRunService(ProcurementStore store, ProcurementCollector collector, ProcurementParsingService parsing,
                                 ProcurementCacheStore cache, ProcurementRuleGroupService groups) {
        this.store = store;
        this.collector = collector;
        this.parsing = parsing;
        this.cache = cache;
        this.groups = groups;
    }

    public Run start(String siteId, String noticeId, boolean useLlm, boolean parseOnly) {
        return startTargets(store.targets(siteId, noticeId), useLlm, parseOnly);
    }

    /** 按发现批次输入执行，不混入历史来源，也不截断为首页 100 条。 */
    public Run startSelected(List<Notice> targets, boolean parseOnly) {
        return startSelected(targets, parseOnly, parseOnly);
    }

    public Run startSelected(List<Notice> targets, boolean parseOnly, boolean useLlm) {
        return startTargets(targets, useLlm, parseOnly);
    }

    private Run startTargets(List<Notice> selected, boolean useLlm, boolean parseOnly) {
        if (!running.compareAndSet(false, true)) { throw new IllegalArgumentException("已有采集任务运行中，请等待完成"); }
        try {
            List<Notice> targets = selected.stream()
                    .filter(n -> !parseOnly || !n.rawText().isBlank()).toList();
            if (targets.isEmpty()) { throw new IllegalArgumentException("没有可采集的公告，请登记 URL 或启用对应站点"); }
            List<Rule> rules = groups.snapshot();
            Run run = new Run(UUID.randomUUID().toString(), "RUNNING", targets.size(), 0, 0, 0, "",
                    Instant.now().toString(), Instant.now().toString());
            store.createRun(run, parsing.json(rules));
            executor.execute(() -> execute(run, targets, rules, useLlm, parseOnly));
            return run;
        } catch (RuntimeException e) { running.set(false); throw e; }
    }

    private void execute(Run run, List<Notice> targets, List<Rule> rules, boolean useLlm, boolean parseOnly) {
        int succeeded = 0;
        int processed = 0;
        Set<String> hosts = store.sites().stream().map(Site::host).collect(Collectors.toSet());
        try {
            for (Notice notice : targets) {
                boolean success = parseOnly ? parseExisting(notice, run.id(), rules, useLlm)
                        : captureOne(notice, run.id(), hosts, rules, useLlm);
                if (success) { succeeded++; }
                processed++;
                store.updateRun(progress(run, "RUNNING", processed, succeeded, ""));
            }
            String status = succeeded == targets.size() ? "COMPLETED" : succeeded == 0 ? "FAILED" : "PARTIAL";
            store.updateRun(progress(run, status, processed, succeeded, ""));
        } catch (RuntimeException e) {
            store.updateRun(progress(run, "FAILED", processed, succeeded, "任务中断：" + e.getMessage()));
        } finally { running.set(false); }
    }

    private boolean parseExisting(Notice n, String runId, List<Rule> rules, boolean useLlm) {
        if (!useLlm && "PARSED".equals(n.parseStatus())) { return true; }
        Parsed result = parsing.parse(n.rawText(), rules, useLlm);
        cache.record(n.id(), runId, n.rawText(), parsing.json(rules), result);
        String analysis = parsing.retainOnFailure(n.analysis(), result);
        store.saveCapture(new Notice(n.id(), n.siteId(), n.url(), n.title(), n.captureStatus(), result.status(),
                n.rawText(), n.finalUrl(), n.frameUrl(), n.httpStatus(), n.capturedAt(), result.error(),
                result.candidates(), analysis, n.sourceData(), runId, Instant.now().toString()));
        return !useLlm || "PARSED".equals(result.status());
    }

    private boolean captureOne(Notice n, String runId, Set<String> hosts, List<Rule> rules, boolean useLlm) {
        try {
            if (!n.rawText().isBlank()) {
                if (!useLlm && "PARSED".equals(n.parseStatus())) { return true; }
                return parseExisting(n, runId, rules, useLlm);
            }
            ProcurementCatalogService.validateUrl(n.url(), hosts);
            Capture capture = cache.find(n.id()).orElseGet(() -> collector.capture(n.url(), hosts));
            if (capture.text() == null || capture.text().length() < 100 || capture.text().length() > 80000) {
                throw new IllegalArgumentException("采集正文长度不满足要求");
            }
            cache.save(n.id(), capture);
            Parsed result = parsing.parse(capture.text(), rules, useLlm);
            cache.record(n.id(), runId, capture.text(), parsing.json(rules), result);
            store.saveCapture(new Notice(n.id(), n.siteId(), n.url(),
                    n.title().equals(n.url()) ? capture.title() : n.title(), "SUCCESS", result.status(), capture.text(),
                    capture.finalUrl(), capture.frameUrl(), capture.httpStatus(), Instant.now().toString(), result.error(),
                    result.candidates(), result.analysis(), n.sourceData(), runId, Instant.now().toString()));
            return true;
        } catch (RuntimeException e) {
            store.saveCapture(new Notice(n.id(), n.siteId(), n.url(), n.title(), "FAILED", n.parseStatus(),
                    n.rawText(), n.finalUrl(), n.frameUrl(), n.httpStatus(), n.capturedAt(), e.getMessage(),
                    n.candidates(), n.analysis(), n.sourceData(), runId, Instant.now().toString()));
            return false;
        }
    }

    public List<Link> discover(String siteId) {
        Site site = store.sites().stream().filter(s -> s.id().equals(siteId)).findFirst().orElseThrow();
        if (!Boolean.TRUE.equals(site.enabled()) || site.listUrl().isBlank()) {
            throw new IllegalArgumentException("请先启用站点并设置公告列表入口");
        }
        return collector.capture(site.listUrl(), Set.of(site.host())).links();
    }

    private Run progress(Run r, String status, int processed, int succeeded, String error) {
        return new Run(r.id(), status, r.total(), processed, succeeded, processed - succeeded,
                error, r.createTime(), Instant.now().toString());
    }
}
