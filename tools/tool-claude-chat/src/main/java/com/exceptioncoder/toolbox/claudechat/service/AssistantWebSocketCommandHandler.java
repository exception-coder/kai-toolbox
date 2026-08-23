package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.ServerMessage;
import com.exceptioncoder.toolbox.common.assistant.AssistantCapabilityPort;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.auth.web.AuthenticatedHandshakeInterceptor;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.function.Supplier;

/** 统一 WS 中嵌入式助手控制命令的协议适配器。 */
@Component
public class AssistantWebSocketCommandHandler {

    private final ObjectProvider<AssistantCapabilityPort> capabilityProvider;
    private final ObjectMapper mapper;

    public AssistantWebSocketCommandHandler(ObjectProvider<AssistantCapabilityPort> capabilityProvider,
                                            ObjectMapper mapper) {
        this.capabilityProvider = capabilityProvider;
        this.mapper = mapper;
    }

    public void handle(WebSocketSession ws, ClientMessage.AssistantIntentRoute command) {
        execute(ws, command.requestId(), "intentRoute", () -> capability().routeIntent(
                command.mode(), requireText(command.text(), "text", 4_000)));
    }

    public void handle(WebSocketSession ws, ClientMessage.AssistantContextSave command) {
        execute(ws, command.requestId(), "contextSave", () -> capability().saveContext(
                requireText(command.sessionId(), "sessionId", 100),
                requireText(command.protocolVersion(), "protocolVersion", 20), command.contextSnapshot()));
    }

    public void handle(WebSocketSession ws, ClientMessage.AssistantModuleContextResolve command) {
        execute(ws, command.requestId(), "moduleContextResolve", () -> capability().resolveModuleContext(
                command.appId(), command.moduleKey(), command.route(), command.sourceRevision()));
    }

    public void handle(WebSocketSession ws, ClientMessage.AssistantModuleContextSave command) {
        execute(ws, command.requestId(), "moduleContextSave", () -> capability().saveModuleContext(
                command.appId(), command.moduleKey(), command.route(), command.sourceRevision(), command.summary()));
    }

    public void handle(WebSocketSession ws, ClientMessage.AssistantDraftCreate command) {
        execute(ws, command.requestId(), "draftCreate", () -> capability().createDraft(
                requireText(command.sessionId(), "sessionId", 100), command.kind(),
                requireText(command.title(), "title", 200),
                requireText(command.description(), "description", 10_000),
                command.contextSnapshot(), command.evidence()));
    }

    public void handle(WebSocketSession ws, ClientMessage.AssistantDraftConfirm command) {
        execute(ws, command.requestId(), "draftConfirm", () -> capability().confirmDraft(
                requireText(command.draftId(), "draftId", 100),
                requireText(command.idempotencyKey(), "idempotencyKey", 100), command.engineerUserId()));
    }

    public void handle(WebSocketSession ws, ClientMessage.AssistantUsersList command) {
        execute(ws, command.requestId(), "usersList", () -> capability().listAssignableUsers());
    }

    private void execute(WebSocketSession ws, String requestId, String action, Supplier<Object> operation) {
        String correlationId;
        try {
            correlationId = requireText(requestId, "requestId", 100);
        } catch (IllegalArgumentException exception) {
            send(ws, new ServerMessage.AssistantCommandResult(
                    0, requestId, action, false, null, "INVALID_COMMAND", exception.getMessage()));
            return;
        }

        AuthPrincipal principal = authenticatedPrincipal(ws);
        if (principal == null) {
            send(ws, new ServerMessage.AssistantCommandResult(
                    0, correlationId, action, false, null, "UNAUTHORIZED", "WebSocket 未认证"));
            return;
        }

        AuthPrincipal previous = AuthContext.current().orElse(null);
        AuthContext.set(principal);
        try {
            Object data = operation.get();
            send(ws, new ServerMessage.AssistantCommandResult(
                    0, correlationId, action, true, data, null, null));
        } catch (ResponseStatusException exception) {
            HttpStatusCode status = exception.getStatusCode();
            send(ws, new ServerMessage.AssistantCommandResult(
                    0, correlationId, action, false, null, "HTTP_" + status.value(), exception.getReason()));
        } catch (IllegalArgumentException exception) {
            send(ws, new ServerMessage.AssistantCommandResult(
                    0, correlationId, action, false, null, "INVALID_COMMAND", exception.getMessage()));
        } catch (RuntimeException exception) {
            send(ws, new ServerMessage.AssistantCommandResult(
                    0, correlationId, action, false, null, "COMMAND_FAILED", "助手命令执行失败"));
        } finally {
            AuthContext.clear();
            if (previous != null) {
                AuthContext.set(previous);
            }
        }
    }

    private AssistantCapabilityPort capability() {
        AssistantCapabilityPort capability = capabilityProvider.getIfAvailable();
        if (capability == null) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                    "Assistant 能力未启用");
        }
        return capability;
    }

    private AuthPrincipal authenticatedPrincipal(WebSocketSession ws) {
        Object value = ws.getAttributes().get(AuthenticatedHandshakeInterceptor.AUTH_PRINCIPAL_ATTRIBUTE);
        return value instanceof AuthPrincipal principal ? principal : null;
    }

    private String requireText(String value, String field, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isBlank() || normalized.length() > maxLength) {
            throw new IllegalArgumentException(field + " 不能为空且长度不能超过 " + maxLength);
        }
        return normalized;
    }

    private void send(WebSocketSession ws, ServerMessage message) {
        try {
            synchronized (ws) {
                if (ws.isOpen()) {
                    ws.sendMessage(new TextMessage(mapper.writeValueAsString(message)));
                }
            }
        } catch (IOException ignored) {
            // 连接已断开时，客户端会重连并重新发起具备 requestId/幂等键的命令。
        }
    }
}
