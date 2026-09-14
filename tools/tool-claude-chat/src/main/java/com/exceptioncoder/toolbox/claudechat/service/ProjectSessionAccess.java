package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.springframework.stereotype.Service;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;

/** Sidecar 执行边界的项目政策：恢复、后续轮次与附加目录也不能绕过全局排除。 */
@Service
public class ProjectSessionAccess {
    private static final Set<String> EXECUTION = Set.of("start", "resume", "user", "steer", "voicePrepare", "voiceReconnect");
    private final ProjectAccess access;
    private final ClaudeChatSessionRepository sessions;

    public ProjectSessionAccess(ProjectAccess access, ClaudeChatSessionRepository sessions) {
        this.access = access;
        this.sessions = sessions;
    }

    public void check(Map<String, ?> payload) {
        if (!EXECUTION.contains(String.valueOf(payload.get("type")))) return;
        Object cwd = payload.get("cwd");
        if (cwd instanceof String path && !path.isBlank()) access.requireAllowed(Path.of(path));
        Object sessionId = payload.get("sessionId");
        if (sessionId instanceof String id) sessions.findById(id).ifPresent(session -> {
            if (session.getCwd() != null && !session.getCwd().isBlank()) access.requireAllowed(Path.of(session.getCwd()));
        });
        if (payload.get("additionalDirectories") instanceof Iterable<?> paths) {
            for (Object value : paths) {
                if (value instanceof String path && !path.isBlank()) access.requireAllowed(Path.of(path));
            }
        }
    }
}
