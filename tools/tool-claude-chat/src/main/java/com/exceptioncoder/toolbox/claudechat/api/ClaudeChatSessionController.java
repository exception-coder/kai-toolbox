package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeChatActivityView;
import com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeChatSessionView;
import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.ServerMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.RenameSessionProjectRequest;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionRuntimeStateView;
import com.exceptioncoder.toolbox.claudechat.api.dto.EngineCatalogView;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionPlanState;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.exceptioncoder.toolbox.claudechat.service.SessionPlanStateService;
import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
import com.exceptioncoder.toolbox.claudechat.service.SessionProjectService;
import com.exceptioncoder.toolbox.claudechat.service.SessionProjectDirectoryService;
import com.exceptioncoder.toolbox.claudechat.service.SessionSiteService;
import com.exceptioncoder.toolbox.claudechat.service.SessionRuntimeStateService;
import com.exceptioncoder.toolbox.claudechat.service.EngineCatalogService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 会话列表 / 删除。
 *
 * - 列表元数据走 SQLite 持久化，刷新 / 换客户端都保留；
 * - live 字段反映该会话当前是否仍挂在活跃 sidecar 上（可 attach 接回进行中的一轮）；
 * - DELETE 删持久记录，同时通知 service 释放还挂着的会话。
 */
@RestController
@RequestMapping("/api/claude-chat/sessions")
public class ClaudeChatSessionController {

    /** 只有这两个引擎的 transcript 落盘位置是已知的，其余引擎一律不判定，避免误标。 */
    private static final Set<String> TRANSCRIPT_AWARE_ENGINES = Set.of("claude", "codex");

    private final ClaudeChatSessionRepository repo;
    private final ClaudeChatService service;
    private final SessionHistoryService historyService;
    private final SessionPlanStateService planStateService;
    private final SessionProjectService sessionProjectService;
    private final SessionSiteService sessionSiteService;
    private final SessionProjectDirectoryService sessionProjectDirectoryService;
    private final SessionRuntimeStateService runtimeStateService;
    private final EngineCatalogService engineCatalogService;

    public ClaudeChatSessionController(ClaudeChatSessionRepository repo, ClaudeChatService service,
                                       SessionHistoryService historyService,
                                       SessionPlanStateService planStateService,
                                       SessionProjectService sessionProjectService,
                                       SessionSiteService sessionSiteService,
                                       SessionProjectDirectoryService sessionProjectDirectoryService,
                                       SessionRuntimeStateService runtimeStateService,
                                       EngineCatalogService engineCatalogService) {
        this.repo = repo;
        this.service = service;
        this.historyService = historyService;
        this.planStateService = planStateService;
        this.sessionProjectService = sessionProjectService;
        this.sessionSiteService = sessionSiteService;
        this.sessionProjectDirectoryService = sessionProjectDirectoryService;
        this.runtimeStateService = runtimeStateService;
        this.engineCatalogService = engineCatalogService;
    }

    @GetMapping
    public List<ClaudeChatSessionView> list() {
        List<ClaudeChatSession> all = repo.findAll();
        // 一次目录扫描批量判定 transcript 存在性，避免逐会话遍历目录树
        Set<String> missing = historyService.findMissingTranscriptsByLocation(
                all.stream()
                        .filter(this::transcriptAware)
                        .map(s -> new SessionHistoryService.TranscriptLocation(
                                s.getSdkSessionId(), s.getCodexHome()))
                        .toList());
        Map<String, SessionPlanState> planStates =
                planStateService.listStates(all.stream().map(ClaudeChatSession::getId).toList());
        return all.stream()
                .map(s -> ClaudeChatSessionView.from(s, service.isLive(s.getId()),
                        transcriptAware(s) && missing.contains(s.getSdkSessionId()), planStates.get(s.getId())))
                .toList();
    }

    /** 自动更新前的只读活动快照；调用本接口不会 attach、恢复或修改任何会话。 */
    @GetMapping("/activity")
    public ClaudeChatActivityView activity() {
        return service.activitySnapshot();
    }

    /** 引擎的 transcript 落盘位置已知，才有资格被判定为「记录已丢失」。 */
    private boolean transcriptAware(ClaudeChatSession s) {
        String engine = s.getEngine() == null ? "claude" : s.getEngine();
        return TRANSCRIPT_AWARE_ENGINES.contains(engine);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.dropSession(id);
        sessionSiteService.clear(id);
        sessionProjectDirectoryService.clear(id);
        repo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    /** 重命名工具会话（改 SQLite title）。 */
    @PutMapping("/{id}/title")
    public ResponseEntity<Void> rename(@PathVariable String id, @RequestBody Map<String, String> body) {
        String title = body.get("title");
        if (title == null || title.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        repo.updateTitle(id, title.trim());
        return ResponseEntity.noContent().build();
    }

    /** 设置/清除会话分组（改 SQLite group_name；空/缺省=移出分组）。后端持久化，跨端可见。 */
    @PutMapping("/{id}/group")
    public ResponseEntity<Void> setGroup(@PathVariable String id, @RequestBody Map<String, String> body) {
        String group = body.get("group");
        String g = group == null || group.isBlank() ? null : group.trim();
        String subgroup = body.get("subgroup");
        String sg = subgroup == null || subgroup.isBlank() ? null : subgroup.trim();
        repo.updateGroup(id, g, sg);
        return ResponseEntity.noContent().build();
    }

    /** 返回指定会话的全链路实时状态，不在查询过程中修改会话。 */
    @GetMapping("/{id}/runtime-state")
    public ResponseEntity<SessionRuntimeStateView> runtimeState(@PathVariable String id) {
        return runtimeStateService.inspect(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** 返回经过 Sidecar Runtime 探活的引擎目录，供新建和切换会话共同使用。 */
    @GetMapping("/engine-catalog")
    public EngineCatalogView engineCatalog(@RequestParam(defaultValue = "false") boolean refresh) {
        return engineCatalogService.list(refresh);
    }

    /** 将项目及其全部会话原子重命名，保留需求子分组。 */
    @PutMapping("/projects/name")
    public ResponseEntity<Void> renameProject(@RequestBody RenameSessionProjectRequest request) {
        return switch (sessionProjectService.rename(request.oldName(), request.newName())) {
            case RENAMED, UNCHANGED -> ResponseEntity.noContent().build();
            case INVALID_NAME -> ResponseEntity.badRequest().build();
            case SOURCE_NOT_FOUND -> ResponseEntity.notFound().build();
            case TARGET_EXISTS -> ResponseEntity.status(HttpStatus.CONFLICT).build();
        };
    }

    /** 将会话标记为重点收藏。 */
    @PutMapping("/{id}/favorite")
    public ResponseEntity<Void> favorite(@PathVariable String id) {
        return repo.updateFavorite(id, true)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    /** 取消会话重点收藏。 */
    @DeleteMapping("/{id}/favorite")
    public ResponseEntity<Void> unfavorite(@PathVariable String id) {
        return repo.updateFavorite(id, false)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    /**
     * 标记会话规划过期；运行中的会话必须先结束或中断。
     *
     * @param id 逻辑会话 ID
     * @return 204 成功，404 不存在，409 仍在运行
     */
    @PutMapping("/{id}/plan-expired")
    public ResponseEntity<Void> expirePlan(@PathVariable String id) {
        SessionPlanStateService.ExpireResult result = planStateService.expire(id, service.isLive(id));
        return switch (result) {
            case SUCCESS -> ResponseEntity.noContent().build();
            case NOT_FOUND -> ResponseEntity.notFound().build();
            case RUNNING -> ResponseEntity.status(HttpStatus.CONFLICT).build();
        };
    }

    /**
     * 显式解除规划锁定。
     *
     * @param id 逻辑会话 ID
     * @return 204 成功，404 不存在
     */
    @DeleteMapping("/{id}/plan-expired")
    public ResponseEntity<Void> unlockPlan(@PathVariable String id) {
        return planStateService.unlock(id)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    /**
     * 跨会话答题：读取「非当前打开会话」的未决权限/提问请求详情（若有）。
     * 配合 {@link #decidePending}，让提问弹窗能在任意模块/页面自动弹出并直接作答，
     * 不必先切到该会话——之前只有一条跨会话横幅提示"去确认"，点了才跳转、才看得到题面。
     * 204 = 该会话当前没有未决请求（可能已被别的端处理，或本来就没有）。
     */
    @GetMapping("/{id}/pending")
    public ResponseEntity<ServerMessage> pending(@PathVariable String id) {
        return service.pendingRequestOf(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /**
     * 跨会话答题：提交对某会话未决请求的决策，不需要把该会话切成当前 WS 绑定的会话。
     * 请求体字段跟 WS 的 decision 消息一致（reqId/behavior/updatedInput/answers），但类型上
     * 特意不直接绑定 {@link ClientMessage.Decision}——它实现了密封接口 {@link ClientMessage}，
     * 该接口类上标了 @JsonTypeInfo(property="type")，Jackson 反序列化具体子类时仍会继承要求
     * JSON 里带判别字段 "type"；这里是纯 REST 业务体，没有 WS 信封的 type，直接绑会 400/500
     * （HttpMessageNotReadableException: missing type id property 'type'）。收到后手动转一次。
     */
    @PostMapping("/{id}/pending/decision")
    public ResponseEntity<Map<String, Boolean>> decidePending(@PathVariable String id,
                                                                @RequestBody PendingDecisionRequest body) {
        ClientMessage.Decision decision = new ClientMessage.Decision(
                body.reqId(), body.behavior(), body.updatedInput(), body.answers());
        boolean ok = service.decisionForSession(id, decision);
        if (!ok) {
            return ResponseEntity.unprocessableEntity().body(Map.of("ok", false));
        }
        return ResponseEntity.ok(Map.of("ok", true));
    }

    record PendingDecisionRequest(String reqId, String behavior,
                                   Map<String, Object> updatedInput,
                                   Map<String, Object> answers) {}
}
