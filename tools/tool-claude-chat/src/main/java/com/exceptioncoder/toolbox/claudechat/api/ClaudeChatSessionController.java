package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeChatSessionView;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

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

    private final ClaudeChatSessionRepository repo;
    private final ClaudeChatService service;

    public ClaudeChatSessionController(ClaudeChatSessionRepository repo, ClaudeChatService service) {
        this.repo = repo;
        this.service = service;
    }

    @GetMapping
    public List<ClaudeChatSessionView> list() {
        return repo.findAll().stream()
                .map(s -> ClaudeChatSessionView.from(s, service.isLive(s.getId())))
                .toList();
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
}
