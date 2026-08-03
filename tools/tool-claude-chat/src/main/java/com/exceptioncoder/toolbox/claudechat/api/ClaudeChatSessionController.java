package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeChatSessionView;
import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.ServerMessage;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
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

    public ClaudeChatSessionController(ClaudeChatSessionRepository repo, ClaudeChatService service,
                                       SessionHistoryService historyService) {
        this.repo = repo;
        this.service = service;
        this.historyService = historyService;
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
        return all.stream()
                .map(s -> ClaudeChatSessionView.from(s, service.isLive(s.getId()),
                        transcriptAware(s) && missing.contains(s.getSdkSessionId())))
                .toList();
    }

    /** 引擎的 transcript 落盘位置已知，才有资格被判定为「记录已丢失」。 */
    private boolean transcriptAware(ClaudeChatSession s) {
        String engine = s.getEngine() == null ? "claude" : s.getEngine();
        return TRANSCRIPT_AWARE_ENGINES.contains(engine);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.dropSession(id);
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
