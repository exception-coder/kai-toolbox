package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.SessionStorageView;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.storage.SessionStorageService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/** 批量只读会话记录大小查询；浏览器不能提供任意文件路径。 */
@RestController
@RequestMapping("/api/claude-chat/sessions/storage")
public class SessionStorageController {
    private static final int MAX_BATCH = 100;
    private final ClaudeChatSessionRepository sessions;
    private final ClaudeChatSessionAccessPolicy access;
    private final SessionStorageService storage;

    public SessionStorageController(ClaudeChatSessionRepository sessions,
                                    ClaudeChatSessionAccessPolicy access,
                                    SessionStorageService storage) {
        this.sessions = sessions;
        this.access = access;
        this.storage = storage;
    }

    /** 只查询已保存且当前用户可访问的逻辑会话，写盘和模型执行均不会发生。 */
    @PostMapping
    public List<SessionStorageView> inspect(@RequestBody StorageRequest request) {
        if (request.sessionIds() == null || request.sessionIds().isEmpty()
                || request.sessionIds().size() > MAX_BATCH
                || request.sessionIds().stream().anyMatch(id -> id == null || id.isBlank() || id.length() > 100)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择 1-100 个会话");
        }
        var found = sessions.findByIds(request.sessionIds().stream().distinct().toList());
        return storage.inspect(found.stream().filter(access::canAccessCurrentUser).toList());
    }

    /** 受限的逻辑会话身份集合，不接收路径或引擎凭据。 */
    public record StorageRequest(List<String> sessionIds) { }
}
