package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.AssistantConversationHistoryService;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 彩虹胶囊固定页面会话的渐进历史读取接口。 */
@RequireAuth
@RestController("assistantConversationController")
@RequestMapping("/api/assistant/conversations")
public class AssistantConversationController {
    private final AssistantConversationHistoryService history;

    public AssistantConversationController(AssistantConversationHistoryService history) {
        this.history = history;
    }

    /**
     * 读取当前用户页面会话的一页消息。
     *
     * @param sessionId 逻辑会话 ID
     * @param before 更早消息游标
     * @param limit 页大小
     * @return 用户和助手消息页
     */
    @GetMapping("/{sessionId}/messages")
    public AssistantConversationHistoryService.ConversationPage messages(
            @PathVariable String sessionId,
            @RequestParam(required = false) Integer before,
            @RequestParam(required = false) Integer limit) {
        return history.messages(sessionId, before, limit);
    }
}
