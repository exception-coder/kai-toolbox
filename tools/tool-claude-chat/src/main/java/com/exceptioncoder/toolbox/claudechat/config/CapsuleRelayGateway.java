package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.service.CapsuleRelayIdentityService;
import com.exceptioncoder.toolbox.claudechat.service.SessionExecutionPolicy;
import com.exceptioncoder.toolbox.common.auth.web.AuthenticatedHandshakeInterceptor;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.server.HandshakeInterceptor;

/** 受信宿主的胶囊咨询通道，身份和命令限制独立于已退役的会话委托。 */
public final class CapsuleRelayGateway implements WebSocketHandler, HandshakeInterceptor {
    public static final String PATH = SessionExecutionPolicy.CAPSULE_WS_PATH;
    private static final String IDENTITY = CapsuleRelayGateway.class.getName();
    private static final int MAX_MESSAGE_BYTES = 256 * 1024;
    private static final Set<String> COMMANDS = Set.of("open", "attach", "send", "queue", "interrupt",
            "voiceControl", "assistantContextSave", "assistantModuleContextResolve", "assistantModuleContextSave",
            "assistantConversationAnalyze", "assistantIntentRoute");
    private static final List<String> DEVELOPMENT_OPTIONS = List.of(
            "cwd", "model", "apiBaseUrl", "authToken", "codexHome", "consultEvidenceSystems");
    private final CapsuleRelayIdentityService identities;
    private final ClaudeChatWebSocketHandler handler;
    private final ObjectMapper mapper;

    public CapsuleRelayGateway(CapsuleRelayIdentityService identities, ClaudeChatWebSocketHandler handler,
            ObjectMapper mapper) {
        this.identities = identities;
        this.handler = handler;
        this.mapper = mapper;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler ignored, Map<String, Object> attributes) {
        try {
            var identity = identities.authenticate(request.getHeaders().getFirst("Authorization"),
                    Long.parseLong(request.getHeaders().getFirst("X-Forge-Participant-Id")));
            attributes.put(IDENTITY, identity);
            attributes.put(AuthenticatedHandshakeInterceptor.AUTH_PRINCIPAL_ATTRIBUTE, identity.principal());
            return true;
        } catch (RuntimeException exception) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler handler, Exception error) {
        // 认证结果只存放在连接属性中，无额外握手资源需要释放。
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        handler.afterConnectionEstablished(session);
    }

    @Override
    public void handleMessage(WebSocketSession session, WebSocketMessage<?> message) throws Exception {
        if (!(message instanceof TextMessage text) || text.getPayloadLength() > MAX_MESSAGE_BYTES) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        var identity = (CapsuleRelayIdentityService.Identity) session.getAttributes().get(IDENTITY);
        if (!stillAuthorized(session, identity)) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        ObjectNode command = parseCommand(text);
        if (command == null) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        if ("open".equals(command.path("type").asText())) {
            command.remove(DEVELOPMENT_OPTIONS);
            command.put("projectKey", identity.projectKey());
            command.put("assistantAppId", identity.projectKey());
            command.put("engine", "codex");
            command.put("mode", "plan");
        }
        if (command.has("appId")) {
            command.put("appId", identity.projectKey());
        }
        handler.handleMessage(session, new TextMessage(mapper.writeValueAsString(command)));
    }

    private boolean stillAuthorized(WebSocketSession session, CapsuleRelayIdentityService.Identity identity) {
        if (identity == null) {
            return false;
        }
        try {
            var current = identities.authenticate(session.getHandshakeHeaders().getFirst("Authorization"),
                    Long.parseLong(session.getHandshakeHeaders().getFirst("X-Forge-Participant-Id")));
            return identity.projectKey().equals(current.projectKey())
                    && identity.principal().userId() == current.principal().userId();
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private ObjectNode parseCommand(TextMessage text) {
        try {
            var parsed = mapper.readTree(text.getPayload());
            return parsed instanceof ObjectNode node && COMMANDS.contains(node.path("type").asText()) ? node : null;
        } catch (JsonProcessingException exception) {
            return null;
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable error) throws Exception {
        handler.handleTransportError(session, error);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        handler.afterConnectionClosed(session, status);
    }

    @Override
    public boolean supportsPartialMessages() {
        return false;
    }
}
