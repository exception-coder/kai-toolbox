package com.exceptioncoder.toolbox.reqpool.api;

import com.exceptioncoder.toolbox.reqpool.api.dto.AssignReqRequest;
import com.exceptioncoder.toolbox.reqpool.api.dto.CreateReqRequest;
import com.exceptioncoder.toolbox.reqpool.api.dto.LinkPrdRequest;
import com.exceptioncoder.toolbox.reqpool.api.dto.ReqItemView;
import com.exceptioncoder.toolbox.reqpool.api.dto.UpdateReqRequest;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.exceptioncoder.toolbox.reqpool.repository.ReqItemRepository;
import com.exceptioncoder.toolbox.reqpool.service.ReqAnalysisService;
import com.exceptioncoder.toolbox.reqpool.service.ReqDevelopmentAccessPolicy;
import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
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
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

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
    private final ReqDevelopmentAccessPolicy developmentAccess;
    private final AuthProperties authProperties;

    public ReqPoolController(ReqItemRepository repo, JdbcTemplate jdbc, ReqAnalysisService analysis,
                             ReqDevelopmentAccessPolicy developmentAccess, AuthProperties authProperties) {
        this.repo = repo;
        this.jdbc = jdbc;
        this.analysis = analysis;
        this.developmentAccess = developmentAccess;
        this.authProperties = authProperties;
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

    /**
     * 代码节点进入 Vibe Coding 前的权威权限检查。
     * ADMIN 可处理全部需求；普通账号只可处理 assignee_user_id 与本人一致的需求。
     */
    @GetMapping("/prd-sessions/{prdSessionId}/development-access")
    public Map<String, Object> developmentAccess(@PathVariable String prdSessionId) {
        ReqItem item = repo.findByPrdSessionId(prdSessionId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "未找到 PRD 对应的需求登记"));
        AuthPrincipal principal = AuthContext.current().orElse(null);
        boolean admin = principal != null && principal.hasAnyRole("ADMIN");
        boolean allowed = !authProperties.isEnabled()
                || admin
                || (principal != null && developmentAccess.canDevelop(principal.userId(), prdSessionId));
        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "仅管理员或该需求负责人可以发起开发");
        }
        String devSessionId = jdbc.query(
                "SELECT dev_session_id FROM prd_session WHERE id = ?",
                rs -> rs.next() ? rs.getString(1) : null,
                prdSessionId);
        return Map.of(
                "allowed", true,
                "itemId", item.getId(),
                "prdSessionId", prdSessionId,
                "devSessionId", devSessionId == null ? "" : devSessionId);
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
        if (req.assignee() != null) {
            // 兼容旧客户端的文本负责人更新，但解除旧账号绑定，避免姓名与账号 ID 不一致。
            existing.setAssignee(req.assignee());
            existing.setAssigneeUserId(null);
        }
        existing.setDeadline(req.deadline() != null ? req.deadline() : existing.getDeadline());
        existing.setTags(req.tags() != null ? req.tags() : existing.getTags());
        existing.setUpdatedAt(System.currentTimeMillis());
        repo.update(existing);
        return ReqItemView.from(existing);
    }

    /** 绑定启用账号为负责人；姓名字段只保存显示快照，账号 ID 才是稳定关联。 */
    @PutMapping("/items/{id}/assignee")
    public ReqItemView assign(@PathVariable String id, @RequestBody AssignReqRequest req) {
        ReqItem existing = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "需求不存在: " + id));
        if (req.userId() == null) {
            existing.setAssignee(null);
            existing.setAssigneeUserId(null);
        } else {
            List<Map<String, Object>> users = jdbc.queryForList(
                    "SELECT id, username, real_name FROM auth_user WHERE id = ? AND enabled = 1",
                    req.userId());
            if (users.isEmpty()) {
                throw new ResponseStatusException(NOT_FOUND, "指派账号不存在或已停用: " + req.userId());
            }
            Map<String, Object> user = users.getFirst();
            String username = String.valueOf(user.get("username"));
            String realName = user.get("real_name") != null ? String.valueOf(user.get("real_name")).trim() : "";
            existing.setAssignee(realName.isBlank() ? username : realName);
            existing.setAssigneeUserId(req.userId());
        }
        existing.setUpdatedAt(System.currentTimeMillis());
        repo.update(existing);
        return ReqItemView.from(existing);
    }

    @DeleteMapping("/items/{id}")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable String id) {
        deleteOne(id);
        return ResponseEntity.noContent().build();
    }

    private boolean deleteOne(String id) {
        ReqItem existing = repo.findById(id).orElse(null);
        if (existing == null) return false;
        String prdSessionId = existing.getPrdSessionId();
        if (prdSessionId != null && !prdSessionId.isBlank()) {
            jdbc.update("""
                    INSERT INTO req_pool_prd_exclusion (prd_session_id, excluded_at)
                    VALUES (?, ?)
                    ON CONFLICT(prd_session_id) DO UPDATE SET excluded_at = excluded.excluded_at
                    """, prdSessionId, System.currentTimeMillis());
        }
        repo.delete(id);
        return true;
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
        List<ReqItem> items = rootRequirements(repo.findAll(null, null, null)).stream()
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
        List<ReqItem> items = rootRequirements(repo.findAll(null, null, null)).stream()
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
     *   <li>DRAFT   → DRAFT（快速起草后已进入统一需求池，尚未开始澄清）</li>
     *   <li>DONE    → PRD_READY（PRD 已生成）</li>
     *   <li>CLARIFYING → CLARIFYING（正在澄清中）</li>
     * </ul>
     *
     * <p>新记录：INSERT；已有记录发生变化：UPDATE；已绑定 PRD 但源 PRD 不存在：DELETE。
     * 独立登记（prd_session_id 为空）的需求不参与删除。幂等：重复调用安全，只处理差异。
     */
    @PostMapping("/sync-from-prd")
    public ResponseEntity<Map<String, Object>> syncFromPrd() {
        List<Map<String, Object>> sessions = jdbc.queryForList(
                "SELECT id, title, raw_input, project, module, status FROM prd_session " +
                "WHERE status IN ('DRAFT', 'DONE', 'CLARIFYING') " +
                "AND NOT EXISTS (SELECT 1 FROM req_pool_prd_exclusion " +
                "WHERE req_pool_prd_exclusion.prd_session_id = prd_session.id)"
        );

        long now = System.currentTimeMillis();
        int created = 0, updated = 0;

        // 需求池是 PRD 的镜像视图之一：只清理“明确绑定过 PRD、但源记录已删除”的孤立镜像。
        // prd_session_id 为空的独立登记/演示需求不受影响。
        int deleted = jdbc.update("""
                DELETE FROM req_pool_item
                WHERE prd_session_id IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM prd_session
                    WHERE prd_session.id = req_pool_item.prd_session_id
                  )
                """);
        jdbc.update("""
                DELETE FROM req_pool_prd_exclusion
                WHERE NOT EXISTS (
                  SELECT 1 FROM prd_session
                  WHERE prd_session.id = req_pool_prd_exclusion.prd_session_id
                )
                """);

        for (Map<String, Object> s : sessions) {
            String prdId = String.valueOf(s.get("id"));
            String prdStatus = String.valueOf(s.get("status"));
            String title = s.get("title") != null ? String.valueOf(s.get("title")) : "未命名需求";
            String description = s.get("raw_input") != null ? String.valueOf(s.get("raw_input")) : null;
            String project = s.get("project") != null ? String.valueOf(s.get("project")) : null;
            String module = s.get("module") != null ? String.valueOf(s.get("module")) : null;
            // prd_session 状态映射到 req_pool_item 状态
            String reqStatus = switch (prdStatus) {
                case "DONE" -> "PRD_READY";
                case "CLARIFYING" -> "CLARIFYING";
                default -> "DRAFT";
            };

            // 查询是否已有对应条目
            List<Map<String, Object>> existing = jdbc.queryForList(
                    "SELECT id, title, description, project, module, status " +
                            "FROM req_pool_item WHERE prd_session_id = ? " +
                            "ORDER BY CASE WHEN assignee_user_id IS NOT NULL OR assignee IS NOT NULL THEN 0 ELSE 1 END, " +
                            "CASE WHEN deadline IS NOT NULL AND deadline <> '' THEN 0 ELSE 1 END, created_at ASC", prdId);

            if (existing.isEmpty()) {
                // 新建
                ReqItem item = ReqItem.builder()
                        .id(UUID.randomUUID().toString())
                        .title(title)
                        .description(description)
                        .project(project)
                        .module(module)
                        .priority("MEDIUM")
                        .status(reqStatus)
                        .prdSessionId(prdId)
                        .createdAt(now)
                        .updatedAt(now)
                        .build();
                repo.insert(item);
                created++;
            } else {
                // PRD 草稿是事实源：标题、描述、项目、模块和阶段发生变化时统一回写需求池。
                // 历史版本可能为同一 PRD 建出多条镜像：保留负责人/承诺信息更完整的一条，其余直接去重。
                Map<String, Object> current = existing.getFirst();
                String existingId = String.valueOf(current.get("id"));
                for (int index = 1; index < existing.size(); index++) {
                    repo.delete(String.valueOf(existing.get(index).get("id")));
                    deleted++;
                }
                boolean changed = !Objects.equals(title, current.get("title"))
                        || !Objects.equals(description, current.get("description"))
                        || !Objects.equals(project, current.get("project"))
                        || !Objects.equals(module, current.get("module"))
                        || !Objects.equals(reqStatus, current.get("status"));
                if (changed) {
                    jdbc.update("UPDATE req_pool_item SET title = ?, description = ?, project = ?, " +
                                    "module = ?, status = ?, updated_at = ? WHERE id = ?",
                            title, description, project, module, reqStatus, now, existingId);
                    updated++;
                }
            }
        }

        return ResponseEntity.ok(Map.of("created", created, "updated", updated, "deleted", deleted));
    }

    /**
     * 修订版与拆分子需求仍保留独立交付证据，但组合分析只能按根需求参与一次，
     * 否则同一条业务需求的 v2/v3 会被重复计权并挤占优先级名次。
     */
    private List<ReqItem> rootRequirements(List<ReqItem> items) {
        Set<String> childSessionIds = jdbc.queryForList(
                        "SELECT id FROM prd_session WHERE parent_id IS NOT NULL AND parent_id <> ''",
                        String.class)
                .stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        return items.stream()
                .filter(item -> item.getPrdSessionId() == null
                        || !childSessionIds.contains(item.getPrdSessionId()))
                .toList();
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
