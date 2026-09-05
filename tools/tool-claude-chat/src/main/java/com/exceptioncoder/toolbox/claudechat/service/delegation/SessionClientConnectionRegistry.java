package com.exceptioncoder.toolbox.claudechat.service.delegation;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** 跟踪公共连接，使暂停或撤销可以立即切断已建立的 WebSocket。 */
@Component
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class SessionClientConnectionRegistry {

    private final ConcurrentHashMap<String, Set<WebSocketSession>> byGrant = new ConcurrentHashMap<>();
    private final Set<String> activeParticipantTurns = ConcurrentHashMap.newKeySet();

    public void register(String grantId, WebSocketSession session) {
        byGrant.computeIfAbsent(grantId, ignored -> ConcurrentHashMap.newKeySet()).add(session);
    }

    public void unregister(String grantId, WebSocketSession session) {
        Set<WebSocketSession> sessions = byGrant.get(grantId);
        if (sessions == null) return;
        sessions.remove(session);
        if (sessions.isEmpty()) byGrant.remove(grantId, sessions);
    }

    public void closeGrant(String grantId, String reason) {
        activeParticipantTurns.remove(grantId);
        Set<WebSocketSession> sessions = byGrant.remove(grantId);
        if (sessions == null) return;
        for (WebSocketSession session : sessions) {
            try {
                if (session.isOpen()) session.close(new CloseStatus(4003, reason));
            } catch (IOException ignored) {
                // 连接已不可写时，移除注册即完成撤销。
            }
        }
    }

    public void markTurnStarted(String grantId) {
        activeParticipantTurns.add(grantId);
    }

    public void markTurnCompleted(String grantId) {
        activeParticipantTurns.remove(grantId);
    }

    public boolean ownsActiveTurn(String grantId) {
        return activeParticipantTurns.contains(grantId);
    }

    public int connectionCount(String grantId) {
        Set<WebSocketSession> sessions = byGrant.get(grantId);
        return sessions == null ? 0 : (int) sessions.stream().filter(WebSocketSession::isOpen).count();
    }
}
