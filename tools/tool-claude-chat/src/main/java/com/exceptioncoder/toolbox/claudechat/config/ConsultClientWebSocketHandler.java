package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatAttachmentRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ConsultRuntimeRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.exceptioncoder.toolbox.claudechat.service.ConsultClientTickets;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.auth.web.AuthenticatedHandshakeInterceptor;
import com.exceptioncoder.toolbox.llm.spi.ConsultClientApplication;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.handler.WebSocketSessionDecorator;

/** Versioned business-only facade. Never deserializes the development/admin command union. */
@Component
public class ConsultClientWebSocketHandler extends TextWebSocketHandler {

    private final ConsultClientTickets tickets;
    private final ConsultClientApplication application;
    private final ClaudeChatService chat;
    private final ClaudeChatAttachmentRepository attachments;
    private final ObjectMapper mapper;
    private final ConsultRuntimeRepository runtimeRequests;
    private final Map<String, Connection> connections =
        new ConcurrentHashMap<>();
    private static final int MAX_CONNECTIONS = 128;
    private static final org.slf4j.Logger log =
        org.slf4j.LoggerFactory.getLogger(ConsultClientWebSocketHandler.class);

    public ConsultClientWebSocketHandler(
        ConsultClientTickets tickets,
        ConsultClientApplication application,
        ClaudeChatService chat,
        ClaudeChatAttachmentRepository attachments,
        ObjectMapper mapper,
        ConsultRuntimeRepository runtimeRequests
    ) {
        this.tickets = tickets;
        this.application = application;
        this.chat = chat;
        this.attachments = attachments;
        this.mapper = mapper;
        this.runtimeRequests = runtimeRequests;
    }

    @Override
    public synchronized void afterConnectionEstablished(WebSocketSession socket)
        throws IOException {
        if (!tickets.enabled() || connections.size() >= MAX_CONNECTIONS) {
            socket.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        socket.setTextMessageSizeLimit(32 * 1024);
        socket.setBinaryMessageSizeLimit(1);
        var connection = new Connection(socket);
        connections.put(socket.getId(), connection);
        CompletableFuture.delayedExecutor(5, TimeUnit.SECONDS).execute(() -> {
            synchronized (connection.commandLock) {
                if (connection.principal() == null && socket.isOpen()) close(
                    socket
                );
            }
        });
    }

    @Override
    protected void handleTextMessage(WebSocketSession socket, TextMessage frame)
        throws IOException {
        var c = connections.get(socket.getId());
        if (c == null) {
            close(socket);
            return;
        }
        synchronized (c.commandLock) {
            JsonNode message;
            String requestId = null;
            try {
                message = mapper.readTree(frame.getPayload());
                if (
                    message == null || !message.isObject()
                ) throw new IllegalArgumentException("消息格式无效");
                requestId = message.path("requestId").asText(null);
                String type = message.path("type").asText();
                if (c.principal() == null) {
                    if (!"auth".equals(type)) throw new ResponseStatusException(
                        org.springframework.http.HttpStatus.UNAUTHORIZED
                    );
                    var principal = tickets.consume(
                        message.path("ticket").asText(null),
                        socket.getHandshakeHeaders().getOrigin()
                    );
                    socket
                        .getAttributes()
                        .put(
                            AuthenticatedHandshakeInterceptor.AUTH_PRINCIPAL_ATTRIBUTE,
                            principal
                        );
                    c.emit(
                        Map.of(
                            "type",
                            "authenticated",
                            "protocolVersion",
                            "1.0",
                            "expiresAt",
                            principal.expiresAt()
                        )
                    );
                    return;
                }
                tickets.valid(c.principal());
                if (System.currentTimeMillis() - c.window >= 60_000) {
                    c.window = System.currentTimeMillis();
                    c.commands = 0;
                }
                if (++c.commands > 120) throw new ResponseStatusException(
                    org.springframework.http.HttpStatus.TOO_MANY_REQUESTS
                );
                var previous = AuthContext.current().orElse(null);
                AuthContext.set(c.principal());
                try {
                    dispatch(c, type, message);
                } finally {
                    AuthContext.clear();
                    if (previous != null) AuthContext.set(previous);
                }
            } catch (Exception error) {
                String code =
                    error instanceof ResponseStatusException status
                        ? "HTTP_" + status.getStatusCode().value()
                        : error instanceof IllegalArgumentException
                            ? "INVALID_COMMAND"
                            : "REQUEST_FAILED";
                if ("REQUEST_FAILED".equals(code)) {
                    log.warn(
                        "Consult client operation failed connection={} exception={}",
                        socket.getId(),
                        error.getClass().getSimpleName()
                    );
                }
                var result = new LinkedHashMap<String, Object>();
                result.put("type", "error");
                result.put("code", code);
                result.put("requestId", requestId);
                result.put(
                    "message",
                    "请求未完成，请核对身份、咨询状态和参数；已发送状态请通过恢复查询确认"
                );
                c.emit(result);
                if (c.principal() == null || "HTTP_401".equals(code)) close(
                    socket
                );
            }
        }
    }

    private void dispatch(Connection c, String type, JsonNode message)
        throws IOException {
        switch (type) {
            case "ping" -> c.emit(Map.of("type", "pong"));
            case "consult.ask", "consult.create" -> {
                String id = message.path("requestId").asText();
                List<String> ids = new ArrayList<>();
                var input = message.path("attachmentIds");
                if (
                    !input.isMissingNode() &&
                    (!input.isArray() || input.size() > 5)
                ) throw new IllegalArgumentException("附件数量无效");
                for (var value : input) {
                    if (
                        !value.isTextual() ||
                        !value.asText().matches("[A-Za-z0-9_-]{1,100}")
                    ) throw new IllegalArgumentException("附件标识无效");
                    ids.add(value.asText());
                }
                String consult = message.path("consultationId").asText(null);
                if (
                    c.bound != null &&
                    !Objects.equals(consult, c.bound.consultationId()) &&
                    !(consult == null && id.equals(c.requestId))
                ) throw new IllegalArgumentException(
                    "每个客户端连接只能绑定一个咨询，请另建客户端"
                );
                if (!ids.isEmpty()) {
                    if (consult == null) throw new IllegalArgumentException(
                        "上传附件前须先创建咨询"
                    );
                    var bound = application.require(consult, true);
                    if (
                        attachments.findMany(bound.runtimeId(), ids).size() !=
                        new HashSet<>(ids).size()
                    ) throw new IllegalArgumentException("附件不属于当前咨询");
                }
                var prepared = application.prepare(
                    id,
                    consult,
                    message.path("question").asText(),
                    ids
                );
                tickets.valid(c.principal());
                c.bound = prepared.session();
                c.requestId = id;
                c.emit(
                    Map.of(
                        "type",
                        type.equals("consult.create")
                            ? "consult.created"
                            : "accepted",
                        "requestId",
                        id,
                        "consultationId",
                        c.bound.consultationId(),
                        "title",
                        c.bound.title()
                    )
                );
                if (type.equals("consult.create")) return;
                chat.switchSession(
                    c,
                    new ClientMessage.SwitchSession(c.bound.runtimeId())
                );
                var files = attachments
                    .findMany(c.bound.runtimeId(), ids)
                    .stream()
                    .map(f ->
                        new ClientMessage.Send.Attachment(
                            f.id(),
                            f.name(),
                            f.storagePath(),
                            f.mime()
                        )
                    )
                    .toList();
                chat.sendUserMessage(
                    c,
                    new ClientMessage.Send(
                        prepared.prompt(),
                        files,
                        null,
                        null,
                        id
                    )
                );
            }
            case "consult.resume" -> {
                var bound = application.require(
                    message.path("consultationId").asText(),
                    false
                );
                if (
                    c.bound != null &&
                    !c.bound.consultationId().equals(bound.consultationId())
                ) throw new IllegalArgumentException("连接已绑定其他咨询");
                c.bound = bound;
                c.requestId = message.path("requestId").asText(null);
                long cursor = Math.max(0, message.path("afterSeq").asLong(0));
                chat.attach(
                    c,
                    new ClientMessage.Attach(c.bound.runtimeId(), cursor)
                );
            }
            case "consult.cancel" -> {
                var bound = application.require(
                    message.path("consultationId").asText(),
                    true
                );
                if (
                    c.bound == null ||
                    !bound.runtimeId().equals(c.bound.runtimeId())
                ) throw new IllegalArgumentException("请先恢复该咨询");
                chat.interrupt(c);
                c.emit(
                    Map.of(
                        "type",
                        "cancel.requested",
                        "consultationId",
                        bound.consultationId()
                    )
                );
            }
            default -> throw new IllegalArgumentException(
                "不支持的业务咨询命令"
            );
        }
    }

    @Override
    public void afterConnectionClosed(
        WebSocketSession socket,
        CloseStatus status
    ) {
        var c = connections.remove(socket.getId());
        if (c != null) chat.onBrowserDisconnected(c);
    }

    @Override
    public void handleTransportError(WebSocketSession socket, Throwable error) {
        close(socket);
    }

    private void close(WebSocketSession socket) {
        try {
            socket.close(CloseStatus.POLICY_VIOLATION);
        } catch (IOException ignored) {}
    }

    /** Projects only business messages; internal tool inputs, raw errors and filesystem metadata are never sent. */
    private class Connection extends WebSocketSessionDecorator {

        private final Object commandLock = new Object();
        private ConsultClientApplication.Bound bound;
        private String requestId;
        private String activeRequestId;
        private int commands;
        private long window = System.currentTimeMillis();
        private long lastOutgoingAuthCheck;

        Connection(WebSocketSession delegate) {
            super(delegate);
        }

        AuthPrincipal principal() {
            return (AuthPrincipal) getAttributes().get(
                AuthenticatedHandshakeInterceptor.AUTH_PRINCIPAL_ATTRIBUTE
            );
        }

        synchronized void emit(Map<String, ?> value) throws IOException {
            if (isOpen()) getDelegate().sendMessage(
                new TextMessage(mapper.writeValueAsString(value))
            );
        }

        @Override
        public synchronized void sendMessage(WebSocketMessage<?> frame)
            throws IOException {
            if (!(frame instanceof TextMessage text) || bound == null) return;
            try {
                long now = System.currentTimeMillis();
                if (principal() == null || principal().expiresAt() <= now) {
                    ConsultClientWebSocketHandler.this.close(this);
                    return;
                }
                // Avoid one SQLite blacklist query per token; commands still validate on every operation.
                if (now - lastOutgoingAuthCheck >= 1_000) {
                    tickets.valid(principal());
                    lastOutgoingAuthCheck = now;
                }
            } catch (RuntimeException expired) {
                ConsultClientWebSocketHandler.this.close(this);
                return;
            }
            var event = mapper.readTree(text.getPayload());
            String type = event.path("type").asText();
            String publicType = switch (type) {
                case "ready" -> "consult.ready";
                case "assistantDelta" -> "answer.delta";
                case "assistantSnapshot" -> "answer.snapshot";
                case "sendAccepted" -> "send.accepted";
                case "result" -> "completed";
                case "error" -> "error";
                case
                    "warning",
                    "questionRequest",
                    "permissionRequest" -> "status";
                default -> null;
            };
            if (publicType == null) return;
            var result = new LinkedHashMap<String, Object>();
            result.put("type", publicType);
            result.put("seq", event.path("seq").asLong());
            if (type.equals("ready")) activeRequestId = runtimeRequests
                .requestForTurn(
                    bound.runtimeId(),
                    event.path("activeTurnId").asText(null)
                )
                .orElse(null);
            if (type.equals("result")) activeRequestId = runtimeRequests
                .requestForTurn(
                    bound.runtimeId(),
                    event.path("turnId").asText(null)
                )
                .orElse(null);
            result.put("consultationId", bound.consultationId());
            result.put(
                "requestId",
                type.equals("sendAccepted")
                    ? event.path("messageId").asText(null)
                    : type.equals("error")
                        ? requestId
                        : activeRequestId
            );
            if (type.equals("ready")) {
                result.put("status", event.path("status").asText());
                result.put("epoch", event.path("epoch").asText());
                result.put("historyRequired", true);
            }
            if (
                type.equals("assistantDelta") ||
                type.equals("assistantSnapshot")
            ) result.put("text", event.path("text").asText());
            if (type.equals("result")) {
                result.put("stopReason", event.path("stopReason").asText());
                result.put("turnId", event.path("turnId").asText());
            }
            if (type.equals("error") || type.equals("warning")) {
                result.put("code", event.path("code").asText());
                result.put(
                    "message",
                    type.equals("error")
                        ? "咨询暂未完成，请恢复会话并检查执行状态"
                        : "咨询状态已更新，可读取历史和当前状态"
                );
                result.put("terminal", event.path("terminal").asBoolean(false));
            }
            if (
                type.equals("questionRequest") ||
                type.equals("permissionRequest")
            ) {
                result.put("code", "PLATFORM_ACTION_REQUIRED");
                result.put(
                    "message",
                    "该咨询需要补充信息或平台操作，请在业务咨询平台继续当前咨询"
                );
            }
            emit(result);
        }
    }
}
