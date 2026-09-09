package com.exceptioncoder.toolbox.procurement.service;

import com.exceptioncoder.toolbox.procurement.domain.ProcurementDiscovery;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementStore;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.DependsOn;
import org.springframework.core.task.VirtualThreadTaskExecutor;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** 当日列表发现编排，只有明确五省的公告进入后续工作队列。 */
@Service
@DependsOn("schemaInitializer")
public class ProcurementDiscoveryService implements ApplicationRunner {
    private final ProcurementDiscovery.Store discovery;
    private final ProcurementDiscovery.Collector collector;
    private final ProcurementStore notices;
    private final ProcurementRunService runs;
    private final AtomicBoolean running = new AtomicBoolean();
    private final VirtualThreadTaskExecutor executor = new VirtualThreadTaskExecutor("procurement-discovery-");
    public ProcurementDiscoveryService(ProcurementDiscovery.Store discovery, ProcurementDiscovery.Collector collector,
                                       ProcurementStore notices, ProcurementRunService runs) {
        this.discovery = discovery;
        this.collector = collector;
        this.notices = notices;
        this.runs = runs;
    }
    @Override
    public void run(ApplicationArguments args) { discovery.interrupt(); }
    public Map<String, Object> start() {
        if (!running.compareAndSet(false, true)) { throw new IllegalArgumentException("已有链接发现任务运行中"); }
        String id = UUID.randomUUID().toString();
        String date = LocalDate.now(ZoneId.of("Asia/Shanghai")).toString();
        try {
            if (notices.sites().stream().noneMatch(site -> site.host().equals("www.ggzy.gov.cn") && Boolean.TRUE.equals(site.enabled()))) {
                throw new IllegalArgumentException("请先启用全国公共资源交易平台站点");
            }
            discovery.create(id, date);
            executor.execute(() -> execute(id, date));
            return discovery.batch(id);
        } catch (RuntimeException e) { running.set(false); throw e; }
    }
    private void execute(String id, String date) {
        AtomicReference<String> outcome = new AtomicReference<>("FAILED");
        try {
            collector.discover(date, event -> {
                if ("done".equals(event.type())) {
                    if (!Set.of("COMPLETED", "PARTIAL", "FAILED").contains(event.status())) {
                        throw new IllegalArgumentException("发现结束状态无效");
                    }
                    outcome.set(event.status());
                } else {
                    validate(event, date);
                    discovery.accept(id, event);
                }
            });
            if ("COMPLETED".equals(outcome.get())) { verifyComplete(id); }
            discovery.finish(id, outcome.get(), "");
        } catch (RuntimeException e) {
            discovery.finish(id, "FAILED", e.getMessage() == null ? "链接发现失败" : e.getMessage());
        } finally { running.set(false); }
    }
    private void verifyComplete(String id) {
        Object raw = discovery.batch(id).get("scopes");
        if (!(raw instanceof List<?> scopes)) { throw new IllegalStateException("缺少查询完成记录"); }
        for (String source : List.of("省平台", "央企招投标", "商务部", "财政部", "自然资源部", "国资委")) {
            var rows = scopes.stream().filter(row -> row instanceof Map<?, ?> map && source.equals(map.get("source")))
                    .map(row -> (Map<?, ?>) row).toList();
            boolean complete = rows.stream().allMatch(row -> "COMPLETED".equals(row.get("status")));
            boolean global = rows.size() == 1 && "".equals(rows.getFirst().get("province"));
            boolean provincial = rows.size() == 5 && rows.stream().map(row -> row.get("province"))
                    .collect(java.util.stream.Collectors.toSet()).containsAll(List.of("河北", "北京", "山西", "内蒙古", "天津"));
            if (!complete || (!global && !provincial)) { throw new IllegalStateException("查询覆盖不完整：" + source); }
        }
    }
    private void validate(ProcurementDiscovery.Event event, String date) {
        if (!List.of("省平台", "央企招投标", "商务部", "财政部", "自然资源部", "国资委").contains(event.source())
                || event.province() == null || !List.of("", "河北", "北京", "山西", "内蒙古", "天津").contains(event.province())) {
            throw new IllegalArgumentException("发现查询范围无效");
        }
        if ("page".equals(event.type())) {
            if (!date.equals(event.date()) || event.links() == null || event.links().size() > 1000) {
                throw new IllegalArgumentException("列表页日期或数据无效");
            }
            for (var link : event.links()) {
                ProcurementCatalogService.validateUrl(link.url(), Set.of("www.ggzy.gov.cn"));
                if (!date.equals(link.date()) || link.title() == null || link.title().isBlank()
                        || !List.of("MATCHED", "REGION_UNKNOWN", "EXCLUDED").contains(link.regionStatus())
                        || ("MATCHED".equals(link.regionStatus()) && !List.of("河北", "北京", "山西", "内蒙古", "天津").contains(link.province()))) {
                    throw new IllegalArgumentException("发现链接缺少日期、标题或省份依据");
                }
            }
        } else if (!"scope".equals(event.type())) { throw new IllegalArgumentException("发现事件无效"); }
    }
    public com.exceptioncoder.toolbox.procurement.domain.ProcurementData.Run details(String id, boolean parseOnly) {
        return details(id, parseOnly, parseOnly);
    }

    public com.exceptioncoder.toolbox.procurement.domain.ProcurementData.Run details(String id, boolean parseOnly, boolean useLlm) {
        var batch = discovery.batch(id);
        if ("RUNNING".equals(batch.get("status"))) { throw new IllegalArgumentException("请等待本批链接发现完成"); }
        var targets = discovery.noticeIds(id).stream().map(notices::notice).toList();
        if (parseOnly && targets.stream().noneMatch(notice -> !notice.rawText().isBlank())) {
            throw new IllegalArgumentException("本批尚无正文，请先执行第 2 步采集本批详情");
        }
        return runs.startSelected(targets, parseOnly, useLlm);
    }
}
