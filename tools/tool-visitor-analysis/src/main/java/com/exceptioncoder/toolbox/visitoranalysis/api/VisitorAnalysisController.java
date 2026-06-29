package com.exceptioncoder.toolbox.visitoranalysis.api;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.CompetitorDto;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.CustomerRefView;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.VerdictView;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.VisitorInput;
import com.exceptioncoder.toolbox.visitoranalysis.repository.CompetitorRepository;
import com.exceptioncoder.toolbox.visitoranalysis.repository.CustomerRefRepository;
import com.exceptioncoder.toolbox.visitoranalysis.repository.FeedbackRepository;
import com.exceptioncoder.toolbox.visitoranalysis.repository.VerdictRepository;
import com.exceptioncoder.toolbox.visitoranalysis.repository.VisitorRepository;
import com.exceptioncoder.toolbox.visitoranalysis.service.CustomerRefImportService;
import com.exceptioncoder.toolbox.visitoranalysis.service.GreyZoneService;
import com.exceptioncoder.toolbox.visitoranalysis.service.Normalizer;
import com.exceptioncoder.toolbox.visitoranalysis.service.VerdictService;
import com.exceptioncoder.toolbox.visitoranalysis.service.VisitorVectorService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/visitor-analysis")
public class VisitorAnalysisController {

    private static final Logger log = LoggerFactory.getLogger(VisitorAnalysisController.class);

    private final VerdictService verdictService;
    private final VerdictRepository verdictRepo;
    private final CompetitorRepository competitorRepo;
    private final CustomerRefRepository customerRefRepo;
    private final FeedbackRepository feedbackRepo;
    private final VisitorRepository visitorRepo;
    private final CustomerRefImportService customerRefImport;
    private final Normalizer normalizer;
    private final GreyZoneService greyZone;
    private final SseEmitterRegistry sse;

    public VisitorAnalysisController(VerdictService verdictService, VerdictRepository verdictRepo,
                                     CompetitorRepository competitorRepo, CustomerRefRepository customerRefRepo,
                                     FeedbackRepository feedbackRepo, VisitorRepository visitorRepo,
                                     CustomerRefImportService customerRefImport,
                                     Normalizer normalizer, GreyZoneService greyZone, SseEmitterRegistry sse) {
        this.verdictService = verdictService;
        this.verdictRepo = verdictRepo;
        this.competitorRepo = competitorRepo;
        this.customerRefRepo = customerRefRepo;
        this.feedbackRepo = feedbackRepo;
        this.visitorRepo = visitorRepo;
        this.customerRefImport = customerRefImport;
        this.normalizer = normalizer;
        this.greyZone = greyZone;
        this.sse = sse;
    }

    /** 实时单条分析,返回 SSE 流（stage* → done / error）。 */
    @PostMapping("/analyze")
    public SseEmitter analyze(@RequestBody VisitorInput input) {
        String taskId = UUID.randomUUID().toString();
        SseEmitter emitter = sse.create(taskId);
        Thread.ofVirtual().name("va-analyze-" + taskId).start(() -> {
            try {
                verdictService.analyze(taskId, input, "realtime");
            } catch (Exception e) {
                log.warn("分析失败 task={}: {}", taskId, e.toString());
                sse.publish(taskId, "error", Map.of("message", e.getMessage() == null ? "分析失败" : e.getMessage()));
            } finally {
                sse.complete(taskId);
            }
        });
        return emitter;
    }

    /** 同步单条分析,直接返回裁决结果。前端表单用这个；要"看阶段进度"用上面的 SSE 版。 */
    @PostMapping("/analyze-sync")
    public VerdictView analyzeSync(@RequestBody VisitorInput input) {
        return verdictService.analyze(null, input, "realtime");
    }

    /** 批量分析一组访客,逐条走同一判别核心,SSE 推进度 + 最终汇总。 */
    @PostMapping("/batch")
    public SseEmitter batch(@RequestBody List<VisitorInput> inputs) {
        String taskId = UUID.randomUUID().toString();
        SseEmitter emitter = sse.create(taskId);
        Thread.ofVirtual().name("va-batch-" + taskId).start(() -> {
            int total = inputs == null ? 0 : inputs.size();
            int done = 0;
            try {
                if (inputs != null) {
                    for (VisitorInput in : inputs) {
                        VerdictView v = verdictService.analyze(null, in, "batch");
                        done++;
                        sse.publish(taskId, "progress", Map.of(
                                "done", done, "total", total,
                                "identity", v.identity(), "name", v.name() == null ? "" : v.name()));
                    }
                }
                sse.publish(taskId, "done", Map.of("total", total, "done", done));
            } catch (Exception e) {
                sse.publish(taskId, "error", Map.of("message", e.getMessage() == null ? "批量失败" : e.getMessage()));
            } finally {
                sse.complete(taskId);
            }
        });
        return emitter;
    }

    /**
     * 判别记录查询。全部参数可选：q（姓名/公司模糊）、identity（身份枚举精确）、
     * needsReview（仅待复核/仅已确认）。无条件时等同最近 N 条。
     */
    @GetMapping("/verdicts")
    public List<VerdictView> verdicts(@RequestParam(defaultValue = "50") int limit,
                                      @RequestParam(required = false) String q,
                                      @RequestParam(required = false) String identity,
                                      @RequestParam(required = false) Boolean needsReview) {
        int capped = Math.min(500, Math.max(1, limit));
        return verdictRepo.search(q, identity, needsReview, capped);
    }

    @GetMapping("/reviews")
    public List<VerdictView> reviews() {
        return verdictRepo.listNeedsReview();
    }

    /** 一键清空判别历史：判别记录 + 人工纠正 + 访客台账一并重置；参照库/竞品/别名不动。 */
    @DeleteMapping("/verdicts")
    public Map<String, Object> clearVerdicts() {
        feedbackRepo.clear();
        int cleared = verdictRepo.clear();
        visitorRepo.clear();
        log.info("[visitor-analysis] 已清空判别历史: {} 条", cleared);
        return Map.of("cleared", cleared);
    }

    /** 人工纠正：记录反馈并清除复核标记。 */
    @PostMapping("/reviews/{id}/correct")
    public void correct(@PathVariable long id, @RequestBody CorrectRequest req) {
        feedbackRepo.add(id, req.identity(), req.relationship(), req.operator(), req.note());
        verdictRepo.clearReview(id);
    }

    /** 客户资料去重参照库,前端"历史客户资料库"表格用;也是后续去重检索的底库。 */
    @GetMapping("/customer-refs")
    public List<CustomerRefView> customerRefs() {
        return customerRefRepo.list();
    }

    /** 从服务端 CSV 路径导入客户资料到去重参照库（归一化由 Java 统一计算）。本机工具，按 cust_id upsert。 */
    @PostMapping("/customer-refs/import")
    public Map<String, Object> importCustomerRefs(@RequestParam String path) throws java.io.IOException {
        return customerRefImport.importFromCsv(path);
    }

    /** 人工新增一条客户资料。归一化键统一由 Normalizer 计算；返回新建记录（含自增 id）。 */
    @PostMapping("/customer-refs")
    public CustomerRefView createCustomerRef(@RequestBody CustomerRefRequest req) {
        long now = System.currentTimeMillis();
        CustomerRefView c = req.toView(0L, now);
        long id = customerRefRepo.insertManual(c,
                normalizer.company(c.custName()), normalizer.company(c.keyword()),
                normalizer.addr(c.custAddr()), now);
        return customerRefRepo.findById(id);
    }

    /** 编辑一条客户资料（按主键 id）。归一化键同步刷新，synced_at 置空待重新同步。 */
    @PutMapping("/customer-refs/{id}")
    public CustomerRefView updateCustomerRef(@PathVariable long id, @RequestBody CustomerRefRequest req) {
        CustomerRefView existing = customerRefRepo.findById(id);
        if (existing == null) {
            throw new IllegalArgumentException("客户资料不存在: id=" + id);
        }
        CustomerRefView c = req.toView(id, existing.createdAt());
        int n = customerRefRepo.update(id, c,
                normalizer.company(c.custName()), normalizer.company(c.keyword()),
                normalizer.addr(c.custAddr()));
        if (n == 0) throw new IllegalArgumentException("客户资料不存在: id=" + id);
        return customerRefRepo.findById(id);
    }

    /** 删除一条客户资料（按主键 id）。 */
    @DeleteMapping("/customer-refs/{id}")
    public Map<String, Object> deleteCustomerRef(@PathVariable long id) {
        int n = customerRefRepo.delete(id);
        return Map.of("deleted", n);
    }

    /**
     * 一键把客户资料库增量同步到向量库（Qdrant）：只取尚未同步(synced_at 为空)的记录，分批 embedAll + addAll，
     * 单次 HTTP 嵌入整批，每批入库成功后按行主键回标 synced_at——已同步过的下次直接跳过，重复点击近乎秒回。
     * custId 作为稳定 point id，重复同步走 upsert 不重复；资料编辑/重导会把 synced_at 置空，自动纳入下次增量。
     */
    @PostMapping("/customer-refs/sync-vector")
    public Map<String, Object> syncCustomerRefsToVector() {
        if (!greyZone.ping()) {
            return Map.of("ok", false, "total", 0, "indexed", 0, "failed", 0,
                    "message", "向量库未就绪（未启用 RAG 或 Qdrant/嵌入模型不可用），无法同步向量库");
        }
        List<CustomerRefView> pending = customerRefRepo.listUnsynced();
        long now = System.currentTimeMillis();
        int indexed = 0;
        final int BATCH = 64;   // 每批嵌入条数：兼顾单次请求体积与往返次数
        int totalBatches = (pending.size() + BATCH - 1) / BATCH;
        long startNs = System.nanoTime();
        log.info("[visitor-analysis] 客户底库增量同步开始：待同步 {} 条，分 {} 批", pending.size(), totalBatches);
        for (int i = 0; i < pending.size(); i += BATCH) {
            int batchNo = i / BATCH + 1;
            List<CustomerRefView> chunk = pending.subList(i, Math.min(i + BATCH, pending.size()));
            List<VisitorVectorService.CustomerToIndex> items = chunk.stream()
                    .map(c -> new VisitorVectorService.CustomerToIndex(
                            c.id(), c.custId(), c.custName(), normalizer.company(c.custName()),
                            c.custAddr(), normalizer.addr(c.custAddr()), c.level()))
                    .toList();
            long batchStartNs = System.nanoTime();
            List<Long> okIds = greyZone.indexCustomersBatch(items);   // 成功入库的行主键
            customerRefRepo.markSyncedByIds(okIds, now);              // 同步一批标记一批
            indexed += okIds.size();
            long batchMs = (System.nanoTime() - batchStartNs) / 1_000_000;
            long elapsedS = (System.nanoTime() - startNs) / 1_000_000_000;
            log.info("[visitor-analysis] 同步进度 批次 {}/{}（本批 {} 条 {}ms）累计 {}/{} 条，已耗时 {}s",
                    batchNo, totalBatches, chunk.size(), batchMs, indexed, pending.size(), elapsedS);
        }
        long totalS = (System.nanoTime() - startNs) / 1_000_000_000;
        int failed = pending.size() - indexed;
        log.info("[visitor-analysis] 客户底库增量同步完成: pending={} indexed={} failed={} 总耗时={}s",
                pending.size(), indexed, failed, totalS);
        return Map.of("ok", true, "total", pending.size(), "indexed", indexed,
                "failed", failed, "elapsedSeconds", totalS);
    }

    /** 清空向量库已同步的客户资料（va_customers 集合）。清完可重新点「一键同步」灌入。 */
    @DeleteMapping("/vector/customers")
    public Map<String, Object> clearVectorCustomers() {
        if (!greyZone.ping()) {
            return Map.of("ok", false, "message", "向量库未就绪（未启用 RAG 或 Qdrant 不可用），无法清空向量库");
        }
        Map<String, Object> result = greyZone.clearCustomers();
        if (Boolean.TRUE.equals(result.get("ok"))) {
            customerRefRepo.clearSyncedAll();   // 向量库清了，同步标记一并清掉
        }
        return result;
    }

    @GetMapping("/competitors")
    public List<CompetitorDto> competitors() {
        return competitorRepo.list();
    }

    @PostMapping("/competitors")
    public void addCompetitor(@RequestBody CompetitorDto dto) {
        String norm = normalizer.company(dto.rawName());
        if (norm.isEmpty()) return;
        competitorRepo.add(dto.rawName(), norm, dto.source(), dto.note());
    }

    @DeleteMapping("/competitors/{id}")
    public void deleteCompetitor(@PathVariable long id) {
        competitorRepo.delete(id);
    }

    /**
     * 向量召回就绪状态,前端用来提示"灰区是否带历史召回上下文 / 能否同步向量库"。
     * online=false 时灰区仍可判别（只是不带相似客户参考），故非阻断。
     * 端点路径保留 {@code /sidecar-health} 以兼容前端，语义已从「sidecar 在线」改为「向量召回就绪」。
     */
    @GetMapping("/sidecar-health")
    public Map<String, Object> sidecarHealth() {
        return Map.of("online", greyZone.ping());
    }

    public record CorrectRequest(String identity, String relationship, String operator, String note) {
    }

    /**
     * 客户资料新增/编辑入参。归一化键（name_norm/keyword_norm/addr_norm）不接收前端值——
     * 一律由后端 Normalizer 现算，杜绝多端口径漂移。id/createdAt/syncedAt 也由后端掌控。
     */
    public record CustomerRefRequest(
            Long custId, String custName, String keyword, String brandName,
            String custType, String custCategory, String bizMajor,
            String province, String city, String district,
            String custAddr, String checkinAddr, Double lng, Double lat,
            String level, String custProperty, String creator, String note) {

        /** 转 CustomerRefView（归一化键留空，由 repository 调用方用 Normalizer 计算）。 */
        CustomerRefView toView(long id, long createdAt) {
            return new CustomerRefView(id, custId, custName, keyword, brandName,
                    custType, custCategory, bizMajor, province, city, district,
                    custAddr, checkinAddr, lng, lat, level, custProperty, creator, note,
                    createdAt, null);
        }
    }
}
