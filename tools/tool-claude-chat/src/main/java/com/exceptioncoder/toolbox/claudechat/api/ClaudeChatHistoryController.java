package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.HistorySessionView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionUsageView;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAliasRepository;
import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
import com.exceptioncoder.toolbox.claudechat.service.SessionExecutionPolicy;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
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
    @org.springframework.beans.factory.annotation.Autowired
    private ClaudeChatSessionAccessPolicy accessPolicy;
    @org.springframework.beans.factory.annotation.Autowired
    private com.exceptioncoder.toolbox.claudechat.service.SessionImageReferenceService imageReferences;
    @org.springframework.beans.factory.annotation.Autowired
    private com.exceptioncoder.toolbox.claudechat.repository.ConsultRuntimeRepository consultHistory;
    @org.springframework.beans.factory.annotation.Autowired
    private com.exceptioncoder.toolbox.claudechat.service.ConsultRuntimeCoordinator consultRuntime;

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
                                @RequestParam(defaultValue = "30") int limit,
                                @RequestParam(required = false) String sessionId,
                                @RequestParam(required = false) String pagination,
                                @RequestParam(required = false) String cursor) {
        // Native IDs can occur in different Codex homes. The logical session selects the account.
        ClaudeChatSession db = sessionId == null || sessionId.isBlank()
                ? sessionRepo.findBySdkSessionId(sdkSessionId).orElse(null)
                : sessionRepo.findById(sessionId).orElseThrow(() ->
                    new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "会话不存在"));
        if (db == null && consultHistory != null) {
            db = consultHistory.sessionForNative(sdkSessionId).flatMap(sessionRepo::findById).orElse(null);
        }
        if ("cursor".equals(pagination) && db == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.NOT_FOUND, "请先导入历史会话再读取最近消息");
        }
        if (sessionId != null && !sessionId.isBlank() || "cursor".equals(pagination)
                || db != null && SessionExecutionPolicy.isConsultReadonly(db.getExecutionPolicy())) {
            if (!accessPolicy.canAccessCurrentUser(db)) {
                throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "无权读取会话");
            }
            if (SessionExecutionPolicy.isConsultReadonly(db.getExecutionPolicy()) && consultHistory != null) {
                if (consultRuntime != null) consultRuntime.ensureHistory(db);
                if (consultHistory.imported(db.getId())) return consultHistory.messages(db.getId(), before, limit);
            }
            boolean matches = sdkSessionId.equals(db.getSdkSessionId());
            if (!matches && db.getEngineSessions() != null) {
                try {
                    for (JsonNode value : mapper.readTree(db.getEngineSessions())) {
                        if (sdkSessionId.equals(value.asText())) matches = true;
                    }
                } catch (Exception ignored) { /* Invalid mappings cannot authorize a native handle. */ }
            }
            if (!matches) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "原生句柄不属于当前会话");
            cwd = db.getCwd();
        }
        if (db != null && SessionExecutionPolicy.isReviewOnly(db.getExecutionPolicy())) {
            if (cursor != null) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST, "评审历史不接受普通会话字节游标");
            }
            return history.readReviewMessages(db.getCwd(), sdkSessionId, db.getCodexHome(), before, limit);
        }
        String codexHome = db == null ? null : db.getCodexHome();
        // 仅已核验逻辑会话/原生句柄的正常历史页可以登记图片引用。
        boolean trustedPage = db != null && (sessionId != null && !sessionId.isBlank() || "cursor".equals(pagination));
        if ("cursor".equals(pagination)) {
            MessagePage page = history.readCursorMessages(cwd, sdkSessionId, codexHome, before, cursor, limit);
            return trustedPage && imageReferences != null ? imageReferences.remember(db, page) : page;
        }
        if (cursor != null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "字节游标需要匹配的分页模式");
        }
        MessagePage page = history.readMessages(cwd, sdkSessionId, codexHome, before, limit);
        return trustedPage && imageReferences != null ? imageReferences.remember(db, page) : page;
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
        return history.usageTotal(db.getCwd(), new ArrayList<>(sids), db.getCodexHome());
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
