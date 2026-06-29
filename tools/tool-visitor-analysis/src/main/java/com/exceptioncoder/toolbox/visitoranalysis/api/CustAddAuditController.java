package com.exceptioncoder.toolbox.visitoranalysis.api;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.VerdictView;
import com.exceptioncoder.toolbox.visitoranalysis.repository.CustAddAuditRepository;
import com.exceptioncoder.toolbox.visitoranalysis.service.CustAddAuditSyncService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 客户新增审批同步的手动入口 + 台账查看。定时任务由 {@link CustAddAuditSyncService} 自动驱动；
 * 这里供前端「立即拉取 / 立即判别」按钮和列表展示用。
 */
@RestController
@RequestMapping("/api/visitor-analysis/cust-add-audit")
public class CustAddAuditController {

    private final CustAddAuditSyncService syncService;
    private final CustAddAuditRepository repo;

    public CustAddAuditController(CustAddAuditSyncService syncService, CustAddAuditRepository repo) {
        this.syncService = syncService;
        this.repo = repo;
    }

    /** 立即拉取一轮并登记，返回本轮新登记条数。 */
    @PostMapping("/sync")
    public Map<String, Object> sync() throws java.io.IOException {
        int inserted = syncService.syncOnce();
        return Map.of("inserted", inserted);
    }

    /** 立即判别待处理记录，返回完成条数。 */
    @PostMapping("/analyze")
    public Map<String, Object> analyze(@RequestParam(defaultValue = "50") int limit) {
        int done = syncService.analyzePending(Math.min(500, Math.max(1, limit)));
        return Map.of("analyzed", done);
    }

    /**
     * 判别指定记录（供前端「判别当前页」）：传当前页审批记录 id 列表。
     * force=true 连已判别的也重判；否则只判未完成的。返回完成条数。
     */
    @PostMapping("/analyze-ids")
    public Map<String, Object> analyzeIds(@RequestBody AnalyzeIdsRequest req) {
        if (req == null || req.ids() == null || req.ids().isEmpty()) {
            return Map.of("analyzed", 0);
        }
        boolean force = req.force() != null && req.force();
        int done = syncService.analyzeByIds(req.ids(), force);
        return Map.of("analyzed", done);
    }

    /** 「判别当前页」入参：审批记录主键 id 列表 + 是否强制重判。 */
    public record AnalyzeIdsRequest(List<Long> ids, Boolean force) {
    }

    /**
     * 单条判别详情（供前端「判别详情」弹窗）：对该审批记录重新跑一次完整判别流程，
     * 返回 {audit:台账行, verdict:判别结果视图(含 rationale/evidence/向量召回相似记录)}。
     * 重判会刷新该行的判别结果。未找到记录返回 {found:false}。
     */
    @PostMapping("/detail/{id}")
    public Map<String, Object> detail(@PathVariable long id) {
        Map<String, Object> audit = repo.get(id);
        if (audit == null) return Map.of("found", false);
        VerdictView verdict = syncService.analyzeOneDetailed(id, true);
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("found", true);
        out.put("audit", repo.get(id));   // 重判后重新读，带最新判别结果列
        out.put("verdict", verdict);      // 可能为 null（判别失败），前端据此提示
        return out;
    }

    /**
     * 供 Yoooni ERP 审批列表实时回查：按 flowApplyId 返回映射后的判定（PASS/REJECT/DOUBT + 原因 + 置信度%）。
     * 未判别完成返回 {found:false}，ERP 据此显示「暂无 AI 判定」。只读、无副作用。
     */
    @GetMapping("/verdict")
    public Map<String, Object> verdict(@RequestParam long flowApplyId) {
        return syncService.erpVerdict(flowApplyId);
    }

    /**
     * 批量回查（供审批列表整页一次拉取）：{@code ?flowApplyIds=1,2,3}，返回 {flowApplyId → 判定}。
     * 只含已判别完成的条目，缺失的 id 由 ERP 端显示「暂无 AI 判定」。只读。
     */
    @GetMapping("/verdicts")
    public Map<String, Object> verdicts(@RequestParam List<Long> flowApplyIds) {
        return syncService.erpVerdicts(flowApplyIds);
    }

    /**
     * 同步台账分页列表（含判别结果），按生成日期降序、最新在前。
     * 返回 {items, total, page, pageSize}；page 从 0 起，pageSize 上限 200。
     */
    @GetMapping("/records")
    public Map<String, Object> records(@RequestParam(defaultValue = "0") int page,
                                       @RequestParam(defaultValue = "20") int pageSize) {
        int ps = Math.min(200, Math.max(1, pageSize));
        int p = Math.max(0, page);
        int total = repo.countAll();
        List<Map<String, Object>> items = repo.listPaged(p * ps, ps);
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", p);
        out.put("pageSize", ps);
        return out;
    }

    /**
     * 供 Yoooni ERP 回写「AI 判定是否正确」的反馈：按 flowApplyId 定位最新一条审批台账，
     * 回写 erp_feedback_*；correct=false 且带正确身份/关系时同步落 va_feedback。
     * 未找到记录返回 {ok:false, found:false}。
     */
    @PostMapping("/feedback")
    public Map<String, Object> feedback(@RequestBody ErpFeedbackRequest req) {
        if (req == null || req.flowApplyId() == null) {
            return Map.of("ok", false, "found", false, "message", "flowApplyId 必填");
        }
        boolean correct = req.correct() != null && req.correct();
        return syncService.recordErpFeedback(
                req.flowApplyId(), correct, req.reason(),
                req.correctedIdentity(), req.correctedRelationship(), req.operator());
    }

    /**
     * ERP 反馈入参。correct=true 表示 AI 判定正确；false 表示不正确，应带 reason（不正确原因），
     * 可选附正确结果 correctedIdentity / correctedRelationship 与 operator（审批人）。
     */
    public record ErpFeedbackRequest(
            Long flowApplyId, Boolean correct, String reason,
            String correctedIdentity, String correctedRelationship, String operator) {
    }
}
