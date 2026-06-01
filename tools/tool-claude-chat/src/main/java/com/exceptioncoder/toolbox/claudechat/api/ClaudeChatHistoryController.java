package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.HistorySessionView;
import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 磁盘历史会话列表：扫 ~/.claude/projects/&lt;编码cwd&gt;/*.jsonl，复刻插件「历史会话」选择器。
 */
@RestController
@RequestMapping("/api/claude-chat/history")
public class ClaudeChatHistoryController {

    private final SessionHistoryService history;

    public ClaudeChatHistoryController(SessionHistoryService history) {
        this.history = history;
    }

    @GetMapping
    public List<HistorySessionView> list(@RequestParam(required = false) String cwd) {
        return history.list(cwd);
    }
}
