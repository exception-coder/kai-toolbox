package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.HistorySessionView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAliasRepository;
import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 磁盘历史会话列表：扫 ~/.claude/projects/&lt;编码cwd&gt;/*.jsonl，复刻插件「历史会话」选择器。
 * 支持分页读消息、重命名（别名）、删除（移回收目录）。
 */
@RestController
@RequestMapping("/api/claude-chat/history")
public class ClaudeChatHistoryController {

    private final SessionHistoryService history;
    private final SessionAliasRepository aliasRepo;

    public ClaudeChatHistoryController(SessionHistoryService history, SessionAliasRepository aliasRepo) {
        this.history = history;
        this.aliasRepo = aliasRepo;
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
