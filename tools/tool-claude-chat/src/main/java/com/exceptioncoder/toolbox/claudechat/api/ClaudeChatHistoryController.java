package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.HistorySessionView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionUsageView;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAliasRepository;
import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 磁盘历史会话列表：扫 ~/.claude/projects/&lt;编码cwd&gt;/*.jsonl，复刻插件「历史会话」选择器。
 * 支持分页读消息、重命名（别名）、删除（移回收目录）。
 */
@RestController
@RequestMapping("/api/claude-chat/history")
public class ClaudeChatHistoryController {

    private final SessionHistoryService history;
    private final SessionAliasRepository aliasRepo;
    private final ClaudeChatSessionRepository sessionRepo;
    private final ObjectMapper mapper;

    public ClaudeChatHistoryController(SessionHistoryService history, SessionAliasRepository aliasRepo,
                                       ClaudeChatSessionRepository sessionRepo, ObjectMapper mapper) {
        this.history = history;
        this.aliasRepo = aliasRepo;
        this.sessionRepo = sessionRepo;
        this.mapper = mapper;
    }

    @GetMapping
    public List<HistorySessionView> list(@RequestParam(required = false) String cwd) {
        return history.list(cwd);
    }

    /** 分页读取某会话历史消息：进会话渲染最近一页、上拉加载更早。契约见 api-current.md §1。 */
    @GetMapping("/{sdkSessionId}/messages")
    public MessagePage messages(@PathVariable String sdkSessionId,
                                @RequestParam(required = false) String cwd,
                                @RequestParam(required = false) Integer before,
                                @RequestParam(defaultValue = "30") int limit) {
        return history.readMessages(cwd, sdkSessionId, before, limit);
    }

    /**
     * 整会话累计用量：按逻辑会话 id 汇总该会话「所有 agent 段」的 transcript（当前 sdk_session_id
     * + engine_sessions 里各引擎的句柄）求和——切过 agent 的会话也给整会话总和，不漏任何一段。
     * 若 id 不是库里的逻辑会话（如磁盘历史会话的 sdkSessionId），回退为单段直读。
     */
    @GetMapping("/{id}/usage")
    public SessionUsageView usage(@PathVariable("id") String id,
                                  @RequestParam(required = false) String cwd) {
        ClaudeChatSession db = sessionRepo.findById(id).orElse(null);
        if (db == null) {
            return history.usageTotal(cwd, id); // 兼容：传的是磁盘历史会话的 sdkSessionId
        }
        Set<String> sids = new LinkedHashSet<>();
        if (db.getSdkSessionId() != null && !db.getSdkSessionId().isBlank()) {
            sids.add(db.getSdkSessionId());
        }
        String es = db.getEngineSessions();
        if (es != null && !es.isBlank()) {
            try {
                Map<?, ?> m = mapper.readValue(es, Map.class);
                for (Object v : m.values()) {
                    if (v != null && !v.toString().isBlank()) sids.add(v.toString());
                }
            } catch (Exception ignore) {
                // 映射解析失败：至少统计当前段，不影响主流程
            }
        }
        return history.usageTotal(db.getCwd(), new ArrayList<>(sids));
    }

    /** 删除历史会话：移到回收目录，可手动恢复（不破坏原生 /resume 的其它会话）。 */
    @DeleteMapping("/{sdkSessionId}")
    public ResponseEntity<Void> delete(@PathVariable String sdkSessionId,
                                       @RequestParam(required = false) String cwd) {
        history.moveToTrash(cwd, sdkSessionId);
        return ResponseEntity.noContent().build();
    }

    /** 重命名历史会话：设自定义别名（body.alias 空串=清除，回落解析标题）。 */
    @PutMapping("/{sdkSessionId}/alias")
    public ResponseEntity<Void> rename(@PathVariable String sdkSessionId,
                                       @RequestBody Map<String, String> body) {
        aliasRepo.upsert(sdkSessionId, body.get("alias"));
        return ResponseEntity.noContent().build();
    }
}
