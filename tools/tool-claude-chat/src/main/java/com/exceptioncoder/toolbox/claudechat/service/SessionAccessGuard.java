package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ReviewHandshakeInterceptor;
import org.springframework.web.socket.WebSocketSession;

import static com.exceptioncoder.toolbox.claudechat.service.SessionPolicies.isReviewOnly;

/**
 * 会话访问守卫：咨询、评审与开发通道双向隔离，校验当前用户能否绑定目标会话；
 * 评审会话拒绝修改引擎、模型与权限。拒绝时通过事件通道向该连接下发错误。从 ClaudeChatService 拆出。
 */
final class SessionAccessGuard {

    private final SessionEventChannel events;
    private final ClaudeChatSessionAccessPolicy sessionAccessPolicy;

    SessionAccessGuard(SessionEventChannel events, ClaudeChatSessionAccessPolicy sessionAccessPolicy) {
        this.events = events;
        this.sessionAccessPolicy = sessionAccessPolicy;
    }

    boolean rejectReviewMutation(WebSocketSession ws, SessionCtx ctx) {
        if (!isReviewOnly(ctx)) return false;
        events.sendError(ws, 0, "REVIEW_POLICY", "计划评审固定使用 Codex 官方默认配置，参与者不能修改引擎、模型、速度、Auth 或权限");
        return true;
    }

    /** 咨询与开发通道双向隔离，任何入口都不能凭会话 ID 交叉接管另一执行域。 */
    boolean canBind(WebSocketSession ws, String targetPolicy, String targetSessionId) {
        String channelPolicy = SessionExecutionPolicy.forWebSocket(ws.getUri());
        if (!SessionExecutionPolicy.canBind(channelPolicy, targetPolicy)) {
            String message = SessionExecutionPolicy.isConsultReadonly(channelPolicy)
                    ? "业务咨询通道只能访问业务咨询会话"
                    : SessionExecutionPolicy.isReviewOnly(channelPolicy)
                        ? "评审分享通道只能访问评审会话"
                        : "Vibe Coding 通道不能访问受限会话";
            events.sendError(ws, 0, "SESSION_FORBIDDEN", message);
            return false;
        }
        if (!sessionAccessPolicy.canAccess(ws, targetSessionId)) {
            events.sendError(ws, 0, "SESSION_FORBIDDEN", "当前用户不能访问该会话");
            return false;
        }
        return true;
    }

    boolean canBindReviewTarget(WebSocketSession ws, String targetSessionId) {
        String channelPolicy = SessionExecutionPolicy.forWebSocket(ws.getUri());
        if (!SessionExecutionPolicy.isReviewOnly(channelPolicy)) return true;
        Object allowed = ws.getAttributes().get(ReviewHandshakeInterceptor.REVIEW_SESSION_ATTRIBUTE);
        if (targetSessionId != null && targetSessionId.equals(allowed)) return true;
        events.sendError(ws, 0, "SESSION_FORBIDDEN", "该分享链接不能访问其他会话");
        return false;
    }
}
