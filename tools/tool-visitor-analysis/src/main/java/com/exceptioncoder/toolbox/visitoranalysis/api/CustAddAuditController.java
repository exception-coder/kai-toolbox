package com.exceptioncoder.toolbox.visitoranalysis.api;

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
     * 供 Yoooni ERP 审批列表实时回查：按 flowApplyId 返回映射后的判定（PASS/REJECT/DOUBT + 原因 + 置信度%）。
     * 未判别完成返回 {found:false}，ERP 据此显示「暂无 AI 判定」。只读、无副作用。
     */
    @GetMapping("/verdict")
    public Map<String, Object> verdict(@RequestParam long flowApplyId) {
        return syncService.erpVerdict(flowApplyId);
    }

    /** 同步台账列表（含判别结果），最近优先。 */
    @GetMapping("/records")
    public List<Map<String, Object>> records(@RequestParam(defaultValue = "100") int limit) {
        return repo.listRecent(Math.min(500, Math.max(1, limit)));
    }
}
