package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.repository.ChatSubmissionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;

/** 固定会话身份的接单入口，不依赖浏览器当前查看哪个会话。 */
@RestController
@RequestMapping("/api/claude-chat/sessions/{sessionId}/submissions")
public class ChatSubmissionController {
    private final ChatSubmissionRepository records;
    private final ClaudeChatService chat;
    private final ClaudeChatSessionAccessPolicy access;
    public ChatSubmissionController(ChatSubmissionRepository records, ClaudeChatService chat, ClaudeChatSessionAccessPolicy access) {
        this.records = records;
        this.chat = chat;
        this.access = access;
    }
    @GetMapping
    public List<ChatSubmissionRepository.Submission> list(@PathVariable String sessionId) {
        requireAccess(sessionId);
        return records.list(sessionId);
    }
    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void submit(@PathVariable String sessionId, @RequestBody ClientMessage.Send message) {
        requireAccess(sessionId);
        chat.submitUserMessage(sessionId, message);
    }
    private void requireAccess(String sessionId) {
        if (!access.canInteractCurrentUser(sessionId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前用户不能访问该会话");
        }
    }
}
