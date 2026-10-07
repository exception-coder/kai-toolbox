package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.governance.ProjectExecutionControlStore;
import com.exceptioncoder.toolbox.claudechat.service.governance.VerificationCadence;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;
import java.nio.file.Path;

/** 开发者面板入口；不向模型注册修改门禁的 MCP 工具。 */
@RestController
@RequestMapping("/api/claude-chat/sessions/{sessionId}/execution-control")
public class ProjectExecutionControlController {
    private final ClaudeChatSessionRepository sessions;
    private final ClaudeChatSessionAccessPolicy access;
    public ProjectExecutionControlController(ClaudeChatSessionRepository sessions, ClaudeChatSessionAccessPolicy access) {
        this.sessions = sessions;
        this.access = access;
    }
    public record Update(String project, Integer expectedRevision, Boolean enabled, String reason,
                         VerificationCadence verificationCadence) {
        public Update(String project, Integer expectedRevision, Boolean enabled, String reason) {
            this(project, expectedRevision, enabled, reason, null);
        }
    }

    @GetMapping
    public ProjectExecutionControlStore.Control get(@PathVariable String sessionId) {
        return ProjectExecutionControlStore.read(project(sessionId));
    }

    @PutMapping
    public ProjectExecutionControlStore.Control update(@PathVariable String sessionId, @RequestBody Update input) {
        Path root = project(sessionId);
        if (input.expectedRevision() == null || input.expectedRevision() < 0 || input.enabled() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "需要明确的门禁开关和当前版本");
        }
        if (!root.toString().equals(input.project())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "当前项目已变化，请刷新后确认目标");
        }
        String actor = AuthContext.current().map(user -> user.username() + "#" + user.userId()).orElse("local-developer");
        try {
            return ProjectExecutionControlStore.update(root, input.expectedRevision(), input.enabled(),
                    actor + " / session:" + sessionId, input.reason(), input.verificationCadence());
        } catch (ProjectExecutionControlStore.RevisionConflictException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, exception.getMessage());
        }
    }

    private Path project(String sessionId) {
        if (!access.canAccessCurrentUser(sessionId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        var session = sessions.findById(sessionId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (session.getCwd() == null || session.getCwd().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "当前会话没有项目目录");
        }
        access.requireProjectAllowed(session.getCwd());
        try {
            return Path.of(session.getCwd()).toRealPath();
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "项目目录不可访问");
        }
    }
}
