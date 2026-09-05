package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionClientCommand;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionClientEvent;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientErrorCode;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientProtocol;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionClientCommandService;
import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionClientConnectionRegistry;
import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionDelegationService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.time.Instant;

/** 独立公共协议适配器；绝不反序列化管理端 {@link ClientMessage}。 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class SessionClientWebSocketHandler extends TextWebSocketHandler {

    private static final String ATTACHED_ATTRIBUTE = "session-client.attached";

    private final ClaudeChatService chat;
    private final SessionClientCommandService commands;
    private final SessionClientConnectionRegistry connections;
    private final ObjectMapper mapper;

    public SessionClientWebSocketHandler(ClaudeChatService chat, SessionClientCommandService commands,
                                         SessionClientConnectionRegistry connections, ObjectMapper mapper) {
        this.chat = chat;
        this.commands = commands;
        this.connections = connections;
        this.mapper = mapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        SessionDelegationService.ConnectionBinding binding = binding(session);
        if (binding == null) {
            close(session, CloseStatus.POLICY_VIOLATION);
            return;
        }
        connections.register(binding.grantId(), session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        try {
            SessionClientCommand command = mapper.readValue(message.getPayload(), SessionClientCommand.class);
            dispatch(session, command);
        } catch (JsonProcessingException exception) {
            send(session, SessionClientEvent.error(SessionClientProtocol.VERSION, 0, version(session),
                    SessionClientErrorCode.COMMAND_UNSUPPORTED, "公共协议不支持该命令"));
        } catch (SessionGrantException exception) {
            send(session, SessionClientEvent.error(SessionClientProtocol.VERSION, 0, version(session),
                    exception.code(), exception.getMessage()));
            if (!exception.code().retryable()) close(session, new CloseStatus(4003, exception.code().name()));
        } catch (RuntimeException exception) {
            log.error("[session-client] 公共命令执行失败 connectionId={}", session.getId(), exception);
            send(session, SessionClientEvent.error(SessionClientProtocol.VERSION, 0, version(session),
                    SessionClientErrorCode.SERVER_ERROR, "当前操作失败，请稍后重试"));
        }
    }

    private void dispatch(WebSocketSession session, SessionClientCommand command) {
        SessionDelegationService.ConnectionBinding binding = requireBinding(session);
        if (command instanceof SessionClientCommand.Attach attach) {
            if (!SessionClientProtocol.SUPPORTED_VERSIONS.contains(attach.protocolVersion())) {
                throw new SessionGrantException(SessionClientErrorCode.COMMAND_UNSUPPORTED, "协议版本不兼容");
            }
            chat.attach(session, new ClientMessage.Attach(binding.sessionId(), attach.lastEventSeq()));
            session.getAttributes().put(ATTACHED_ATTRIBUTE, true);
            return;
        }
        if (!Boolean.TRUE.equals(session.getAttributes().get(ATTACHED_ATTRIBUTE))) {
            throw new SessionGrantException(SessionClientErrorCode.INVALID_INPUT, "请先 attach 授权会话");
        }
        SessionClientEvent result = switch (command) {
            case SessionClientCommand.Send send -> commands.send(session, binding, send, Instant.now());
            case SessionClientCommand.AnswerQuestion answer -> commands.answer(session, binding, answer, Instant.now());
            case SessionClientCommand.InterruptOwnTurn interrupt ->
                    commands.interrupt(session, binding, interrupt, Instant.now());
            case SessionClientCommand.Acknowledge acknowledge ->
                    commands.acknowledge(binding, acknowledge, Instant.now());
            case SessionClientCommand.Attach ignored -> null;
        };
        if (result != null) send(session, result);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        SessionDelegationService.ConnectionBinding binding = binding(session);
        if (binding != null) connections.unregister(binding.grantId(), session);
        chat.onBrowserDisconnected(session);
    }

    private SessionDelegationService.ConnectionBinding requireBinding(WebSocketSession session) {
        SessionDelegationService.ConnectionBinding binding = binding(session);
        if (binding == null) {
            throw new SessionGrantException(SessionClientErrorCode.AUTHENTICATION_REQUIRED,
                    "连接授权不可用");
        }
        return binding;
    }

    private SessionDelegationService.ConnectionBinding binding(WebSocketSession session) {
        Object value = session.getAttributes().get(SessionClientHandshakeInterceptor.BINDING_ATTRIBUTE);
        return value instanceof SessionDelegationService.ConnectionBinding binding ? binding : null;
    }

    private long version(WebSocketSession session) {
        Object value = session.getAttributes().get(SessionClientHandshakeInterceptor.SESSION_VERSION_ATTRIBUTE);
        return value instanceof Number number ? number.longValue() : 0L;
    }

    private void send(WebSocketSession session, SessionClientEvent event) {
        try {
            if (session.isOpen()) {
                synchronized (session) {
                    session.sendMessage(new TextMessage(mapper.writeValueAsString(event)));
                }
            }
        } catch (IOException ignored) {
            // 断线恢复由 SDK 使用事件水位处理。
        }
    }

    private void close(WebSocketSession session, CloseStatus status) {
        try {
            if (session.isOpen()) session.close(status);
        } catch (IOException ignored) {
            // 已断开。
        }
    }
}
