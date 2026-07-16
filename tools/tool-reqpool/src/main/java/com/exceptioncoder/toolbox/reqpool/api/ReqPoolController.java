package com.exceptioncoder.toolbox.reqpool.api;

import com.exceptioncoder.toolbox.reqpool.api.dto.CreateReqRequest;
import com.exceptioncoder.toolbox.reqpool.api.dto.LinkPrdRequest;
import com.exceptioncoder.toolbox.reqpool.api.dto.ReqItemView;
import com.exceptioncoder.toolbox.reqpool.api.dto.UpdateReqRequest;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.exceptioncoder.toolbox.reqpool.repository.ReqItemRepository;
import com.exceptioncoder.toolbox.reqpool.service.ReqAnalysisService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * 需求管理池 REST API。前缀 {@code /api/reqpool}。
 *
 * <ul>
 *   <li>GET    /items                          — 列表（支持 status/project/priority 过滤）</li>
 *   <li>POST   /items                          — 新建</li>
 *   <li>GET    /items/{id}                     — 详情</li>
 *   <li>PUT    /items/{id}                     — 全量更新</li>
 *   <li>DELETE /items/{id}                     — 删除</li>
 *   <li>POST   /items/{id}/link-prd            — 关联 PRD，状态流转到 PRD_READY</li>
 *   <li>POST   /items/{id}/start-clarify       — 标记开始澄清，状态流转到 CLARIFYING</li>
 *   <li>POST   /seed                           — 写入演示种子数据（表为空时生效）</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/reqpool")
public class ReqPoolController {

    private final ReqItemRepository repo;
    private final JdbcTemplate jdbc;
    private final ReqAnalysisService analysis;

    public ReqPoolController(ReqItemRepository repo, JdbcTemplate jdbc, ReqAnalysisService analysis) {
        this.repo = repo;
        this.jdbc = jdbc;
        this.analysis = analysis;
    }

    @GetMapping("/items")
    public List<ReqItemView> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String project,
            @RequestParam(required = false) String priority) {
        return repo.findAll(status, project, priority).stream()
                .map(ReqItemView::from)
                .toList();
    }

    @PostMapping("/items")
    public ResponseEntity<ReqItemView> create(@Valid @RequestBody CreateReqRequest req) {
        long now = System.currentTimeMillis();
        String priority = (req.priority() != null && !req.priority().isBlank())
                ? req.priority() : "MEDIUM";
        // 若携带 prdSessionId，直接设为 PRD_READY（来自 PRD澄清助手自动注册场景）
        boolean hasPrd = req.prdSessionId() != null && !req.prdSessionId().isBlank();
        ReqItem item = ReqItem.builder()
                .id(UUID.randomUUID().toString())
                .title(req.title())
                .description(req.description())
                .project(req.project())
                .module(req.module())
                .priority(priority)
                .status(hasPrd ? "PRD_READY" : "DRAFT")
                .prdSessionId(hasPrd ? req.prdSessionId() : null)
                .assignee(req.assignee())
                .deadline(req.deadline())
                .tags(req.tags())
                .createdAt(now)
                .updatedAt(now)
                .build();
        repo.insert(item);
        return ResponseEntity.status(HttpStatus.CREATED).body(ReqItemView.from(item));
    }

    @GetMapping("/items/{id}")
    public ReqItemView get(@PathVariable String id) {
        return repo.findById(id)
                .map(ReqItemView::from)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "需求不存在: " + id));
    }

    @PutMapping("/items/{id}")
    public ReqItemView update(@PathVariable String id,
                              @Valid @RequestBody UpdateReqRequest req) {
        ReqItem existing = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "需求不存在: " + id));
        existing.setTitle(req.title() != null ? req.title() : existing.getTitle());
        existing.setDescription(req.description() != null ? req.description() : existing.getDescription());
        existing.setProject(req.project() != null ? req.project() : existing.getProject());
        existing.setModule(req.module() != null ? req.module() : existing.getModule());
        existing.setPriority(req.priority() != null ? req.priority() : existing.getPriority());
        existing.setStatus(req.status() != null ? req.status() : existing.getStatus());
        existing.setAssignee(req.assignee() != null ? req.assignee() : existing.getAssignee());
        existing.setDeadline(req.deadline() != null ? req.deadline() : existing.getDeadline());
        existing.setTags(req.tags() != null ? req.tags() : existing.getTags());
        existing.setUpdatedAt(System.currentTimeMillis());
        repo.update(existing);
        return ReqItemView.from(existing);
    }

    @DeleteMapping("/items/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        repo.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** 标记开始澄清：状态流转 DRAFT → CLARIFYING。 */
    @PostMapping("/items/{id}/start-clarify")
    public ReqItemView startClarify(@PathVariable String id) {
        repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "需求不存在: " + id));
        repo.markClarifying(id);
        return repo.findById(id).map(ReqItemView::from)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "需求不存在: " + id));
    }

    /** 关联 PRD：状态流转 CLARIFYING → PRD_READY，写入 prd_session_id。 */
    @PostMapping("/items/{id}/link-prd")
    public ReqItemView linkPrd(@PathVariable String id,
                               @Valid @RequestBody LinkPrdRequest req) {
        repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "需求不存在: " + id));
        repo.linkPrd(id, req.prdSessionId());
        return repo.findById(id).map(ReqItemView::from)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "需求不存在: " + id));
    }

    /**
     * 写入演示种子数据（若表已有数据则跳过，保证幂等）。
     * 演示时产品经理点一次，立即看到需求池有数据可操作。
     */
    @PostMapping("/seed")
    public ResponseEntity<String> seed() {
        if (repo.count() > 0) {
            return ResponseEntity.ok("already_seeded");
        }
        long now = System.currentTimeMillis();
        List<ReqItem> seeds = List.of(
                buildSeed("需求池 SLA 剩余天数预警", """
                        当需求接近截止日期时，系统没有任何提醒机制，导致需求经常超期未处理。

                        期望功能：
                        - 在需求列表中，距截止日期 ≤3天的需求自动标红高亮
                        - 距截止日期 ≤7天的需求显示黄色警告标记
                        - 支持在配置中心调整预警天数阈值
                        - 可在首页/看板增加"即将超期"汇总视角""",
                        "HIGH", now),
                buildSeed("需求批量状态变更与分配", """
                        产品经理每周需要对大量需求条目做统一状态变更（如将本迭代完成的需求批量标记 DONE），
                        或者将一批需求批量指派给同一个开发人员，目前只能逐条操作，效率极低。

                        期望功能：
                        - 表格行支持多选（勾选框）
                        - 批量变更状态（支持合法的状态流转校验）
                        - 批量修改负责人
                        - 批量删除（需二次确认）""",
                        "MEDIUM", now - 3600_000L),
                buildSeed("需求数据导入（Excel/CSV）", """
                        团队已有大量存量需求分散在 Excel 表格中，希望能够一次性导入到需求池，
                        而不是逐条手动录入。

                        期望功能：
                        - 支持上传 .xlsx 或 .csv 文件
                        - 提供标准导入模板下载
                        - 导入前预览（展示将导入的行数和字段映射）
                        - 导入后生成结果报告（成功/失败/跳过数量）
                        - 重复需求（标题完全相同）自动跳过或提示用户选择""",
                        "MEDIUM", now - 7200_000L),
                buildSeed("需求优先级智能推荐", """
                        当前优先级（HIGH/MEDIUM/LOW）完全依赖人工主观判断，不同产品经理标准不一致，
                        导致优先级参考价值降低。

                        期望功能：
                        - 基于需求描述、关联项目、截止日期等因素，AI 自动建议优先级
                        - 给出建议理由（如：涉及付款流程 + 截止3天 → 建议 HIGH）
                        - 产品经理可一键采纳或手动覆盖
                        - 记录每次优先级变更历史（谁改的、从什么改到什么、理由）""",
                        "LOW", now - 10800_000L)
        );
        seeds.forEach(repo::insert);
        return ResponseEntity.ok("seeded:" + seeds.size());
    }

    /**
     * AI 需求洞察分析：调用 Claude 评估需求价值、优先级、影响范围、ROI。
     * 分析结果持久化到 ai_insight 字段（JSON），前端读取后渲染 AI Recommendation 卡片。
     * 分析较耗时（10-30s），由前端异步触发，不阻塞页面加载。
     */
    @PostMapping("/items/{id}/analyze")
    public ReqItemView analyze(@PathVariable String id) {
        ReqItem item = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "需求不存在: " + id));
        analysis.analyze(item);
        return repo.findById(id).map(ReqItemView::from)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "需求不存在: " + id));
    }

    /**
     * Portfolio 全局分析：把所有活跃需求一起发给 Claude，横向对比后给出相对优先级排序。
     * 与独立分析不同，Portfolio 分析能真正说"A 比 B 更重要是因为…"。
     * 调用一次耗时约 30-60s（N 条 → 1 次大调用），每次更新所有条目的 ai_insight。
     */
    @PostMapping("/portfolio-analyze")
    public ResponseEntity<Map<String, Object>> portfolioAnalyze() {
        // 只分析活跃需求（排除已取消）
        List<ReqItem> items = repo.findAll(null, null, null).stream()
                .filter(i -> !"CANCELLED".equals(i.getStatus()))
                .toList();

        if (items.isEmpty()) {
            return ResponseEntity.ok(Map.of("summary", "暂无需求", "count", 0));
        }

        String summary = analysis.analyzePortfolio(items);
        return ResponseEntity.ok(Map.of("summary", summary, "count", items.size()));
    }

    /**
     * 批量 AI 分析：为所有缺少 ai_insight 的条目触发分析（后台逐一调用，耗时较长）。
     * 返回将要分析的数量，实际分析在后台线程中完成。
     */
    @PostMapping("/batch-analyze")
    public ResponseEntity<Map<String, Object>> batchAnalyze() {
        List<ReqItem> items = repo.findAll(null, null, null).stream()
                .filter(i -> i.getAiInsight() == null || i.getAiInsight().isBlank())
                .toList();

        Thread.ofVirtual().name("reqpool-batch-analyze").start(() -> {
            for (ReqItem item : items) {
                try {
                    analysis.analyze(item);
                    Thread.sleep(500); // 轻微限速，避免 sidecar 过载
                } catch (Exception e) {
                    log.warn("[reqpool] 批量分析失败 itemId={}: {}", item.getId(), e.getMessage());
                }
            }
        });

        return ResponseEntity.ok(Map.of("queued", items.size()));
    }

    /**
     * 从 prd_session 表 Upsert 同步到需求管理池（自动调用，无需手动触发）。
     *
     * <ul>
     *   <li>DONE    → PRD_READY（PRD 已生成）</li>
     *   <li>CLARIFYING → CLARIFYING（正在澄清中）</li>
     * </ul>
     *
     * <p>新记录：INSERT；已有记录且状态变了：UPDATE（如澄清完成后从 CLARIFYING 升为 PRD_READY）。
     * 幂等：重复调用安全，只处理有差异的记录。
     */
    @PostMapping("/sync-from-prd")
    public ResponseEntity<Map<String, Object>> syncFromPrd() {
        List<Map<String, Object>> sessions = jdbc.queryForList(
                "SELECT id, title, project, module, status FROM prd_session " +
                "WHERE status IN ('DONE', 'CLARIFYING')"
        );

        long now = System.currentTimeMillis();
        int created = 0, updated = 0;

        for (Map<String, Object> s : sessions) {
            String prdId = String.valueOf(s.get("id"));
            String prdStatus = String.valueOf(s.get("status"));
            // prd_session 状态映射到 req_pool_item 状态
            String reqStatus = "DONE".equals(prdStatus) ? "PRD_READY" : "CLARIFYING";

            // 查询是否已有对应条目
            List<Map<String, Object>> existing = jdbc.queryForList(
                    "SELECT id, status FROM req_pool_item WHERE prd_session_id = ?", prdId);

            if (existing.isEmpty()) {
                // 新建
                ReqItem item = ReqItem.builder()
                        .id(UUID.randomUUID().toString())
                        .title(String.valueOf(s.getOrDefault("title", "未命名需求")))
                        .project(s.get("project") != null ? String.valueOf(s.get("project")) : null)
                        .module(s.get("module") != null ? String.valueOf(s.get("module")) : null)
                        .priority("MEDIUM")
                        .status(reqStatus)
                        .prdSessionId(prdId)
                        .createdAt(now)
                        .updatedAt(now)
                        .build();
                repo.insert(item);
                created++;
            } else {
                // 若状态不一致则更新（如 CLARIFYING → PRD_READY）
                String existingStatus = String.valueOf(existing.get(0).get("status"));
                if (!reqStatus.equals(existingStatus)) {
                    String existingId = String.valueOf(existing.get(0).get("id"));
                    jdbc.update("UPDATE req_pool_item SET status = ?, updated_at = ? WHERE id = ?",
                            reqStatus, now, existingId);
                    updated++;
                }
            }
        }

        return ResponseEntity.ok(Map.of("created", created, "updated", updated));
    }

    private ReqItem buildSeed(String title, String description, String priority, long createdAt) {
        return ReqItem.builder()
                .id(UUID.randomUUID().toString())
                .title(title)
                .description(description.strip())
                .project("kai-toolbox")
                .module("需求管理池")
                .priority(priority)
                .status("DRAFT")
                .assignee(null)
                .deadline(null)
                .tags(null)
                .createdAt(createdAt)
                .updatedAt(createdAt)
                .build();
    }
}
