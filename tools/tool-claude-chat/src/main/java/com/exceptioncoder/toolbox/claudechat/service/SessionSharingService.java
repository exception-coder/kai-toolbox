package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionSharingRepository;
import com.exceptioncoder.toolbox.common.auth.repository.AuthUserRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;

/** 具名查看授权与执行权限分开，绝不扩张原会话 canAccess 策略。 */
@Service
public class SessionSharingService {
    private final ClaudeChatSessionRepository sessions;
    private final SessionSharingRepository shares;
    private final ClaudeChatSessionAccessPolicy access;
    private final ObjectProvider<AuthUserRepository> users;

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

    public List<AuthUserRepository.Recipient> readers(String sessionId) {
        requireManager(sessionId);
        List<Long> ids = shares.readers(sessionId);
        var accounts = directory().findRecipients(ids).stream().collect(java.util.stream.Collectors.toMap(
                AuthUserRepository.Recipient::id, java.util.function.Function.identity()));
        // 已删除账号也保留撤销入口，避免无主授权占满名额且无法回收。
        return ids.stream().map(id -> accounts.getOrDefault(id,
                new AuthUserRepository.Recipient(id, "已删除账号 #" + id, null))).toList();
    }

    @Transactional
    public void grant(String sessionId, long userId) {
        ClaudeChatSession session = requireManager(sessionId);
        if (directory().findById(userId).filter(user -> user.isEnabled()).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "接收账号不存在或已停用");
        }
        if (Objects.equals(session.getUserId(), userId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "会话拥有者无需额外授权");
        }
        shares.grant(sessionId, userId, principal().userId());
        if (!shares.contains(sessionId, userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "每个会话最多共享给 50 位用户，请先撤销部分授权");
        }
    }

    @Transactional
    public void revoke(String sessionId, long userId) {
        requireManager(sessionId);
        shares.revoke(sessionId, userId);
    }

    public List<SharedSession> sharedWithMe() {
        AuthPrincipal user = principal();
        List<String> ids = shares.sharedSessions(user.userId());
        var loaded = sessions.findByIds(ids).stream().collect(java.util.stream.Collectors.toMap(
                ClaudeChatSession::getId, java.util.function.Function.identity()));
        return ids.stream().map(loaded::get).filter(Objects::nonNull).filter(this::shareable)
                .filter(session -> projectAllowed(session)).map(SharedSession::from).toList();
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
        return SharedSession.from(requireReader(sessionId));
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

    public record SharedSession(String id, String title, String engine, long lastSeenAt) {
        static SharedSession from(ClaudeChatSession session) {
            return new SharedSession(session.getId(), session.getTitle(), session.getEngine(), session.getLastSeenAt());
        }
    }
}
