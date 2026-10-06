package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.changes.TurnChangeService;
import com.exceptioncoder.toolbox.claudechat.service.changes.TurnChangeRecord;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/** 当前会话的轮次文件变更检索，无 Git 写操作。 */
@RestController
@RequestMapping("/api/claude-chat/sessions/{id}/changes")
public class TurnChangeController {
    private final TurnChangeService changes;
    public TurnChangeController(TurnChangeService changes) { this.changes = changes; }
    /** 有界分页，返回第 21 条仅用于判断下一页。 */
    @GetMapping
    public List<TurnChangeRecord> list(@PathVariable String id, @RequestParam(defaultValue = "") String q,
                                      @RequestParam(defaultValue = "") String turnId, @RequestParam(defaultValue = "0") int offset) {
        if (q.length() > 200 || turnId.length() > 100 || offset < 0 || offset > 100000) throw new IllegalArgumentException("检索参数超限");
        return changes.list(id, q, turnId, offset);
    }
}
