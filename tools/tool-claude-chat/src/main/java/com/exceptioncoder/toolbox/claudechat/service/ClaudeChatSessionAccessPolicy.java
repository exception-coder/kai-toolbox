package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.auth.web.AuthenticatedHandshakeInterceptor;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;

/** 统一执行 Claude Chat 会话访问策略。 */
@Service
public class ClaudeChatSessionAccessPolicy {

    private static final String ADMIN_ROLE = "ADMIN";

    private final ClaudeChatSessionRepository repository;

    public ClaudeChatSessionAccessPolicy(ClaudeChatSessionRepository repository) {
        this.repository = repository;
    }

    /** 返回 WebSocket 握手阶段解析出的认证用户；关闭鉴权时为空。 */
    public AuthPrincipal principal(WebSocketSession session) {
        Object value = session.getAttributes().get(AuthenticatedHandshakeInterceptor.AUTH_PRINCIPAL_ATTRIBUTE);
        return value instanceof AuthPrincipal principal ? principal : null;
    }

    /** 新会话归属用户；关闭鉴权时保留 null 兼容本地单用户模式。 */
    public Long ownerId(WebSocketSession session) {
        AuthPrincipal principal = principal(session);
        return principal == null ? null : principal.userId();
    }

    /** WebSocket 连接能否访问目标会话；ADMIN 可访问任意会话，普通用户仅访问本人会话。 */
    public boolean canAccess(WebSocketSession socket, String sessionId) {
        return repository.findById(sessionId).map(session -> canAccess(session, principal(socket))).orElse(false);
    }

    /** HTTP 当前用户能否访问目标会话。 */
    public boolean canAccessCurrentUser(String sessionId) {
        return repository.findById(sessionId)
                .map(session -> canAccess(session, AuthContext.current().orElse(null)))
                .orElse(false);
    }

    /**
     * 明确写操作可由首个认证用户原子认领无归属历史会话；普通读取仍保持原访问边界。
     */
    public boolean canAccessOrClaimCurrentUser(String sessionId) {
        AuthPrincipal principal = AuthContext.current().orElse(null);
        ClaudeChatSession session = repository.findById(sessionId).orElse(null);
        if (session == null) {
            return false;
        }
        if (canAccess(session, principal)) {
            return true;
        }
        if (principal == null || session.getUserId() != null) {
            return false;
        }
        if (repository.claimOwnerIfUnassigned(sessionId, principal.userId())) {
            return true;
        }
        return repository.findById(sessionId)
                .map(current -> canAccess(current, principal))
                .orElse(false);
    }

    /** 当前用户能否批量操作项目下全部会话，避免项目级更新越过会话所有权边界。 */
    public boolean canAccessProjectCurrentUser(String groupName) {
        String normalizedGroupName = groupName == null ? null : groupName.trim();
        if (normalizedGroupName == null || normalizedGroupName.isEmpty()) {
            return true;
        }
        List<ClaudeChatSession> sessions = repository.findByGroupName(normalizedGroupName);
        if (sessions.isEmpty()) {
            return true;
        }
        AuthPrincipal principal = AuthContext.current().orElse(null);
        return sessions.stream().allMatch(session -> canAccess(session, principal));
    }

    private boolean canAccess(ClaudeChatSession session, AuthPrincipal principal) {
        if (principal != null && principal.hasAnyRole(ADMIN_ROLE)) {
            return true;
        }
        if (session.getUserId() == null) {
            return principal == null;
        }
        return principal != null && session.getUserId().equals(principal.userId());
    }
}
