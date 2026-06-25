package com.exceptioncoder.toolbox.visitoranalysis.service;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.CustAddAuditRecord;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.IdentityType;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.VerdictView;
import com.exceptioncoder.toolbox.visitoranalysis.api.dto.VisitorInput;
import com.exceptioncoder.toolbox.visitoranalysis.client.YoooniFlowClient;
import com.exceptioncoder.toolbox.visitoranalysis.config.CustAddAuditSyncProperties;
import com.exceptioncoder.toolbox.visitoranalysis.repository.CustAddAuditRepository;
import com.exceptioncoder.toolbox.visitoranalysis.repository.CustomerRefRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 客户新增审批同步编排：①定时拉取登记 ②定时异步判别。两段定时任务解耦，
 * 拉取只落库（幂等），判别另起一轮领取 PENDING 记录并发处理，标记是否重复客户。
 *
 * <p>「LLM 提议，代码裁决」的判别核心复用 {@link VerdictService}；本服务只做对接、登记与状态机推进。
 */
@Service
public class CustAddAuditSyncService {

    private static final Logger log = LoggerFactory.getLogger(CustAddAuditSyncService.class);
    private static final String SOURCE = "cust-add-audit";
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final YoooniFlowClient client;
    private final CustAddAuditRepository repo;
    private final VerdictService verdictService;
    private final CustomerRefRepository customerRefRepo;
    private final Normalizer normalizer;
    private final CustAddAuditSyncProperties props;

    public CustAddAuditSyncService(YoooniFlowClient client, CustAddAuditRepository repo,
                                   VerdictService verdictService, CustomerRefRepository customerRefRepo,
                                   Normalizer normalizer, CustAddAuditSyncProperties props) {
        this.client = client;
        this.repo = repo;
        this.verdictService = verdictService;
        this.customerRefRepo = customerRefRepo;
        this.normalizer = normalizer;
        this.props = props;
    }

    // —— 定时入口 ——

    @Scheduled(cron = "${toolbox.visitor-analysis.cust-add-audit-sync.pull-cron:0 */10 * * * *}")
    public void scheduledSync() {
        if (!props.isEnabled()) return;
        try {
            int n = syncOnce();
            if (n > 0) log.info("[cust-add-audit] 定时拉取登记 {} 条新记录", n);
        } catch (Exception e) {
            log.warn("[cust-add-audit] 定时拉取失败（本轮不推进水位）: {}", e.getMessage());
        }
    }

    @Scheduled(cron = "${toolbox.visitor-analysis.cust-add-audit-sync.analyze-cron:0 */2 * * * *}")
    public void scheduledAnalyze() {
        if (!props.isEnabled()) return;
        try {
            int n = analyzePending(props.getBatchLimit());
            if (n > 0) log.info("[cust-add-audit] 定时判别完成 {} 条", n);
        } catch (Exception e) {
            log.warn("[cust-add-audit] 定时判别异常: {}", e.getMessage());
        }
    }

    // —— 核心动作（也供手动接口调用）——

    /** 拉取一轮并幂等登记，返回本轮新登记条数。 */
    public int syncOnce() throws java.io.IOException {
        Long watermark = repo.maxMakeDateOrNull();
        String sinceDate = watermark == null
                ? props.getDefaultSinceDate()
                : Instant.ofEpochMilli(watermark).atZone(ZoneId.systemDefault()).toLocalDate().format(DAY);

        List<CustAddAuditRecord> records = client.fetch(sinceDate);
        long now = System.currentTimeMillis();
        int inserted = 0;
        for (CustAddAuditRecord r : records) {
            if (r.flowcheckid() == null) continue;   // 无主键无法幂等，跳过
            Long makeMs = parseMakeDate(r.makeDate());
            if (repo.insertIgnore(r, makeMs, now)) inserted++;
        }
        return inserted;
    }

    /** 领取 PENDING 记录并发判别，返回成功判别条数。 */
    public int analyzePending(int limit) {
        List<Long> ids = repo.listPendingIds(limit);
        if (ids.isEmpty()) return 0;
        java.util.concurrent.atomic.AtomicInteger done = new java.util.concurrent.atomic.AtomicInteger();
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            for (Long id : ids) {
                pool.submit(() -> {
                    if (analyzeOne(id)) done.incrementAndGet();
                });
            }
        } // close() 等待全部虚拟线程结束
        return done.get();
    }

    /** 判别单条：占用→映射→判别→回写。返回是否本线程完成了判别。 */
    private boolean analyzeOne(long id) {
        if (!repo.claim(id)) return false;   // 没抢到（已被其它轮次处理）
        long now = System.currentTimeMillis();
        try {
            Map<String, Object> row = repo.get(id);
            if (row == null) return false;
            String company = str(row.get("company_brand_name"));
            String addr = str(row.get("customer_address"));
            if (addr == null || addr.isBlank()) addr = str(row.get("checkin_address"));
            String custName = str(row.get("customer_name"));
            Object flowcheckid = row.get("flowcheckid");

            VisitorInput input = new VisitorInput(
                    custName, null, company, addr, null,
                    "客户新增审批同步(flowcheckid=" + flowcheckid + ")");

            VerdictView view = verdictService.analyze(null, input, SOURCE);

            boolean duplicate = IdentityType.CUSTOMER.name().equals(view.identity());
            Long dupCustId = duplicate ? lookupDupCustId(company) : null;

            repo.saveVerdict(id, view.visitorId(), view.id(), view.identity(), view.relationship(),
                    view.confidence(), duplicate, dupCustId, view.needsReview(), now);
            return true;
        } catch (Exception e) {
            log.warn("[cust-add-audit] 判别失败 id={}: {}", id, e.toString());
            repo.markFailed(id, e.getMessage(), now);
            return false;
        }
    }

    /**
     * 供 Yoooni ERP 审批列表实时回查的判定视图：把内部 identity/is_duplicate 映射成 ERP 展示枚举
     * PASS（建议通过）/ REJECT（建议拒绝）/ DOUBT（存疑）+ 原因 + 置信度百分比。
     * 业务映射收在 agent 侧，ERP 只展示，互不耦合。未判别完成的返回 {found:false}，ERP 显示「暂无 AI 判定」。
     */
    public Map<String, Object> erpVerdict(long flowApplyId) {
        Map<String, Object> row = repo.findByFlowApplyId(flowApplyId);
        if (row == null) return Map.of("found", false);
        Map<String, Object> v = mapRowToErp(row);
        if (v != null) return v;
        // 还没判别完（PENDING/ANALYZING/FAILED）→ ERP 暂不展示，保持「暂无 AI 判定」
        String status = str(row.get("analyze_status"));
        return Map.of("found", false, "status", status == null ? "" : status);
    }

    /**
     * 批量回查：一次 IN 查询多个 flowApplyId，返回 {flowApplyId字符串 → 判定视图}。
     * 只放入已判别完成(DONE)的条目；未完成/未命中的 key 直接不出现，ERP 端缺 key 即显示「暂无 AI 判定」。
     * 同一 flowApplyId 可能对应多条审批记录(多节点)，rows 已按 id DESC，取最新一条。
     */
    public Map<String, Object> erpVerdicts(List<Long> flowApplyIds) {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        if (flowApplyIds == null || flowApplyIds.isEmpty()) return out;
        List<Map<String, Object>> rows = repo.findByFlowApplyIds(flowApplyIds);
        for (Map<String, Object> row : rows) {
            Long applyNo = asLongOrNull(row.get("apply_no"));
            if (applyNo == null) continue;
            String key = String.valueOf(applyNo);
            if (out.containsKey(key)) continue;          // 已按 id DESC，首个=最新，后续跳过
            Map<String, Object> v = mapRowToErp(row);    // 非 DONE 返回 null
            if (v != null) out.put(key, v);
        }
        return out;
    }

    /** 单条审批台账行 → ERP 展示视图（PASS/REJECT/DOUBT）。未判别完成(status≠DONE)返回 null。 */
    private Map<String, Object> mapRowToErp(Map<String, Object> row) {
        if (!"DONE".equals(str(row.get("analyze_status")))) return null;

        String identity = str(row.get("identity"));
        boolean duplicate = asInt(row.get("is_duplicate")) == 1;
        boolean needsReview = asInt(row.get("needs_review")) == 1;
        Long dupCustId = asLongOrNull(row.get("dup_cust_id"));
        int confidencePct = (int) Math.round(asDouble(row.get("confidence")) * 100);

        String result;
        if (duplicate) {
            result = "REJECT";   // 命中重复客户 → 建议拒绝新增
        } else if (needsReview || "UNKNOWN".equals(identity) || "COMPETITOR".equals(identity)) {
            result = "DOUBT";    // 竞品/低置信/无法识别 → 存疑，转人工
        } else {
            result = "PASS";     // 未命中重复客户 → 建议通过
        }

        String reason = str(row.get("verdict_rationale"));
        if (reason == null || reason.isBlank()) {
            reason = switch (result) {
                case "REJECT" -> "命中重复客户" + (dupCustId == null ? "" : "（custId=" + dupCustId + "）");
                case "DOUBT"  -> "需人工复核（身份=" + (identity == null ? "未知" : identity) + "）";
                default        -> "未命中重复客户，建议通过";
            };
        }

        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("found", true);
        out.put("result", result);
        out.put("reason", reason);
        out.put("confidence", confidencePct);
        out.put("identity", identity);
        out.put("relationship", str(row.get("relationship")));
        out.put("isDuplicate", duplicate);
        out.put("dupCustId", dupCustId);
        out.put("needsReview", needsReview);
        out.put("status", "DONE");
        return out;
    }

    private static int asInt(Object o) {
        return o == null ? 0 : ((Number) o).intValue();
    }

    private static double asDouble(Object o) {
        return o == null ? 0.0 : ((Number) o).doubleValue();
    }

    private static Long asLongOrNull(Object o) {
        return o == null ? null : ((Number) o).longValue();
    }

    /** 命中重复客户时 best-effort 取底库 custId（公司名归一化精确命中）；取不到返回 null。 */
    private Long lookupDupCustId(String company) {
        Map<String, Object> dup = customerRefRepo.findExactByName(normalizer.company(company));
        if (dup == null) return null;
        Object v = dup.get("cust_id");
        return v == null ? null : ((Number) v).longValue();
    }

    /**
     * 容错解析 Yoooni 的 makeDate：依次尝试 {@code yyyy-MM-dd HH:mm:ss}、{@code yyyy-MM-dd}、纯数字 ms。
     * 解析失败返回 null（不影响登记，仅该条不参与水位）。
     */
    static Long parseMakeDate(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String s = raw.trim();
        try {
            return LocalDateTime.parse(s, DATETIME).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        } catch (Exception ignore) { /* 继续尝试 */ }
        try {
            return LocalDate.parse(s, DAY).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
        } catch (Exception ignore) { /* 继续尝试 */ }
        try {
            return Long.parseLong(s);
        } catch (Exception ignore) {
            return null;
        }
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
