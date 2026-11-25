package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionSharingRepository;
import com.exceptioncoder.toolbox.common.auth.repository.AuthUserRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.time.Duration;
import java.nio.file.Path;
import com.exceptioncoder.toolbox.common.project.ProjectCatalog;
import com.exceptioncoder.toolbox.common.project.ProjectPaths;

/** 具名查看和限时协作共用授权管理，交互权限由会话访问策略检查。 */
@Service
public class SessionSharingService {
    private final ClaudeChatSessionRepository sessions;
    private final SessionSharingRepository shares;
    private final ClaudeChatSessionAccessPolicy access;
    private final ObjectProvider<AuthUserRepository> users;
    @org.springframework.beans.factory.annotation.Autowired
    private ApplicationEventPublisher events;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private ProjectCatalog projectCatalog;

    public SessionSharingService(ClaudeChatSessionRepository sessions, SessionSharingRepository shares,
                                 ClaudeChatSessionAccessPolicy access, ObjectProvider<AuthUserRepository> users) {
        this.sessions = sessions;
        this.shares = shares;
        this.access = access;
        this.users = users;
    }

    public List<AuthUserRepository.Recipient> recipients(String sessionId, String query) {
        requireManager(sessionId);
        String normalized = query == null ? "" : query.trim();
        if (normalized.length() < 2 || normalized.length() > 80) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请输入 2 至 80 字的用户名或姓名");
        }
        return directory().searchEnabledRecipients(normalized);
    }

    public List<SharedReader> readers(String sessionId) {
        requireManager(sessionId);
        var grants = shares.readerGrants(sessionId);
        List<Long> ids = grants.stream().map(SessionSharingRepository.ReaderGrant::userId).toList();
        var accounts = directory().findRecipients(ids).stream().collect(java.util.stream.Collectors.toMap(
                AuthUserRepository.Recipient::id, java.util.function.Function.identity()));
        // 已删除账号也保留撤销入口，避免无主授权占满名额且无法回收。
        return grants.stream().map(grant -> {
            long id = grant.userId();
            var account = accounts.getOrDefault(id, new AuthUserRepository.Recipient(id, "已删除账号 #" + id, null));
            return new SharedReader(id, account.username(), account.realName(), grant.expiresAt(), grant.collaborate());
        }).toList();
    }

    public void grant(String sessionId, long userId) {
        grantReader(sessionId, userId, null);
    }

    public void grantTemporary(String sessionId, long userId, int hours) {
        grantReader(sessionId, userId, expiry(hours));
    }

    public void grantCollaboration(String sessionId, long userId, int hours) {
        long expiresAt = expiry(hours);
        requireRecipient(requireManager(sessionId), userId);
        shares.grantCollaboration(sessionId, userId, principal().userId(), expiresAt);
        if (!shares.canCollaborate(sessionId, userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "无法授权，请核对接收账号和会话共享名额");
        }
    }

    private long expiry(int hours) {
        if (hours != 1 && hours != 24 && hours != 168) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择有效的共享期限");
        }
        return System.currentTimeMillis() + Duration.ofHours(hours).toMillis();
    }

    private void grantReader(String sessionId, long userId, Long expiresAt) {
        requireRecipient(requireManager(sessionId), userId);
        shares.grant(sessionId, userId, principal().userId(), expiresAt);
        if (!shares.contains(sessionId, userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "每个会话最多共享给 50 位用户，请先撤销部分授权");
        }
    }

    private void requireRecipient(ClaudeChatSession session, long userId) {
        if (directory().findById(userId).filter(user -> user.isEnabled()).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "接收账号不存在或已停用");
        }
        if (Objects.equals(session.getUserId(), userId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "会话拥有者无需额外授权");
        }
    }

    public void revoke(String sessionId, long userId) {
        requireManager(sessionId);
        shares.revoke(sessionId, userId);
        if (events != null) events.publishEvent(new SharedAccessRevoked(sessionId, userId));
    }

    public Set<String> activeSharesForManagers(List<ClaudeChatSession> visibleSessions) {
        var principal = AuthContext.current().orElse(null);
        var accounts = users.getIfAvailable();
        if (principal == null || accounts == null
                || accounts.findById(principal.userId()).filter(account -> account.isEnabled()).isEmpty()) {
            return Set.of();
        }
        Set<String> active = shares.activeSharedSessionIds();
        return visibleSessions.stream().filter(this::shareable).filter(access::canAccessCurrentUser)
                .map(ClaudeChatSession::getId).filter(active::contains).collect(Collectors.toUnmodifiableSet());
    }

    public List<SharedSession> sharedWithMe() {
        AuthPrincipal user = principal();
        List<String> ids = shares.sharedSessions(user.userId());
        var loaded = sessions.findByIds(ids).stream().collect(java.util.stream.Collectors.toMap(
                ClaudeChatSession::getId, java.util.function.Function.identity()));
        var projects = sharingProjects();
        return ids.stream().map(loaded::get).filter(Objects::nonNull).filter(this::shareable)
                .filter(session -> projectAllowed(session)).map(session -> sharedView(session,
                        shares.canCollaborate(session.getId(), user.userId()), projects)).toList();
    }

    public ClaudeChatSession requireReader(String sessionId) {
        AuthPrincipal user = principal();
        ClaudeChatSession session = sessions.findById(sessionId).orElseThrow(SessionSharingService::notFound);
        if (!shareable(session) || !projectAllowed(session)
                || !(access.canAccessCurrentUser(session) || shares.contains(sessionId, user.userId()))) {
            throw notFound();
        }
        return session;
    }

    public SharedSession view(String sessionId) {
        var session = requireReader(sessionId);
        return sharedView(session, shares.canCollaborate(sessionId, principal().userId()),
                sharingProjects());
    }

    private ClaudeChatSession requireManager(String sessionId) {
        principal();
        ClaudeChatSession session = sessions.findById(sessionId).orElseThrow(SessionSharingService::notFound);
        if (!shareable(session) || !access.canAccessCurrentUser(session)) {
            throw notFound();
        }
        return session;
    }

    private boolean projectAllowed(ClaudeChatSession session) {
        try {
            access.requireProjectAllowed(session.getCwd());
            return true;
        } catch (ResponseStatusException | IllegalArgumentException error) {
            return false;
        }
    }

    private boolean shareable(ClaudeChatSession session) {
        return session.getUserId() != null && !SessionExecutionPolicy.isConsultReadonly(session.getExecutionPolicy())
                && !SessionExecutionPolicy.isReviewOnly(session.getExecutionPolicy());
    }

    private AuthPrincipal principal() {
        AuthPrincipal user = AuthContext.current().orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录后使用会话共享"));
        if (directory().findById(user.userId()).filter(account -> account.isEnabled()).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "账号已停用或不存在");
        }
        return user;
    }

    private AuthUserRepository directory() {
        AuthUserRepository result = users.getIfAvailable();
        if (result == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "启用账号登录后才能具名共享会话");
        }
        return result;
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "会话不存在或当前账号没有权限");
    }

    private List<ProjectCatalog.Entry> sharingProjects() {
        if (projectCatalog == null) return List.of();
        try {
            return projectCatalog.list(false);
        } catch (IllegalArgumentException | IllegalStateException error) {
            org.slf4j.LoggerFactory.getLogger(SessionSharingService.class)
                    .warn("共享项目显示名暂不可用，保留会话读取", error);
            return List.of();
        }
    }

    private SharedSession sharedView(ClaudeChatSession session, boolean collaborate, List<ProjectCatalog.Entry> projects) {
        String title = session.getTitle();
        if (title == null || title.isBlank()) {
            // 与原会话的默认名称一致，只投影末级目录名，不返回本机路径。
            String cwd = session.getCwd() == null ? "" : session.getCwd().replace('\\', '/').replaceAll("/+$", "");
            title = cwd.substring(cwd.lastIndexOf('/') + 1);
            if (title.isBlank() || title.matches("[A-Za-z]:") || title.equals(".")) title = "未命名会话";
        }
        return new SharedSession(session.getId(), title.trim(), session.getEngine(), session.getLastSeenAt(),
                collaborate, projectName(session.getCwd(), projects));
    }

    private String projectName(String cwd, List<ProjectCatalog.Entry> projects) {
        if (cwd == null || cwd.isBlank()) return null;
        try {
            Path directory = ProjectPaths.canonical(Path.of(cwd));
            int depth = -1;
            String name = null;
            for (var project : projects) {
                if (project.excluded() || !project.available() || project.path() == null) continue;
                Path root = ProjectPaths.canonical(Path.of(project.path()));
                if (!directory.startsWith(root)) continue;
                if (root.getNameCount() > depth) {
                    depth = root.getNameCount();
                    name = project.name();
                } else if (root.getNameCount() == depth && !Objects.equals(name, project.name())) {
                    name = null;
                }
            }
            return name == null || name.isBlank() ? null : name;
        } catch (IllegalArgumentException error) {
            return null;
        }
    }

    public record SharedSession(String id, String title, String engine, long lastSeenAt, boolean collaborate, String projectName) {}

    public record SharedReader(long id, String username, String realName, Long expiresAt, boolean collaborate) {}
    public record SharedAccessRevoked(String sessionId, long userId) {}
}
