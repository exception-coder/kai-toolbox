package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeChatSessionView;
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
        Set<String> missing = historyService.findMissingTranscripts(
                all.stream().filter(this::transcriptAware).map(ClaudeChatSession::getSdkSessionId).toList());
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
        repo.updateGroup(id, g);
        return ResponseEntity.noContent().build();
    }
}
