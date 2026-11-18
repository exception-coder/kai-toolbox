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
import java.time.Duration;

/** 具名查看和限时协作共用授权管理，交互权限由会话访问策略检查。 */
@Service
public class SessionSharingService {
    private final ClaudeChatSessionRepository sessions;
    private final SessionSharingRepository shares;
    private final ClaudeChatSessionAccessPolicy access;
    private final ObjectProvider<AuthUserRepository> users;
    @org.springframework.beans.factory.annotation.Autowired
    private ApplicationEventPublisher events;

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

    public List<SharedSession> sharedWithMe() {
        AuthPrincipal user = principal();
        List<String> ids = shares.sharedSessions(user.userId());
        var loaded = sessions.findByIds(ids).stream().collect(java.util.stream.Collectors.toMap(
                ClaudeChatSession::getId, java.util.function.Function.identity()));
        return ids.stream().map(loaded::get).filter(Objects::nonNull).filter(this::shareable)
                .filter(session -> projectAllowed(session)).map(session -> SharedSession.from(session,
                        shares.canCollaborate(session.getId(), user.userId()))).toList();
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
        return SharedSession.from(requireReader(sessionId), shares.canCollaborate(sessionId, principal().userId()));
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

    public record SharedSession(String id, String title, String engine, long lastSeenAt, boolean collaborate) {
        static SharedSession from(ClaudeChatSession session, boolean collaborate) {
            return new SharedSession(session.getId(), session.getTitle(), session.getEngine(), session.getLastSeenAt(), collaborate);
        }
    }

    public record SharedReader(long id, String username, String realName, Long expiresAt, boolean collaborate) {}
    public record SharedAccessRevoked(String sessionId, long userId) {}
}
