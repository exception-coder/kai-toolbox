package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.service.CapsuleRelayIdentityService;
import com.exceptioncoder.toolbox.common.auth.web.AuthenticatedHandshakeInterceptor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.*;
import org.springframework.web.socket.server.HandshakeInterceptor;

/** 受信宿主的胶囊通道，只转交咨询白名单命令。 */
public final class CapsuleRelayGateway implements WebSocketHandler, HandshakeInterceptor {
    public static final String PATH = "/api/session-client/v1/relay/capsule/ws";
    private static final String IDENTITY = CapsuleRelayGateway.class.getName();
    private static final Set<String> COMMANDS = Set.of("open", "attach", "send", "queue", "interrupt",
            "assistantContextSave", "assistantModuleContextResolve", "assistantModuleContextSave",
            "assistantConversationAnalyze", "assistantIntentRoute");
    private final CapsuleRelayIdentityService identities;
    private final ClaudeChatWebSocketHandler handler;
    private final ObjectMapper mapper;

    public CapsuleRelayGateway(CapsuleRelayIdentityService identities, ClaudeChatWebSocketHandler handler, ObjectMapper mapper) {
        this.identities = identities;
        this.handler = handler;
        this.mapper = mapper;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler ignored,
            Map<String, Object> attributes) {
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

    @Override public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler handler, Exception error) { }
    @Override public void afterConnectionEstablished(WebSocketSession session) throws Exception { handler.afterConnectionEstablished(session); }

    @Override
    public void handleMessage(WebSocketSession session, WebSocketMessage<?> message) throws Exception {
        if (!(message instanceof TextMessage text) || text.getPayloadLength() > 262144) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        var identity = (CapsuleRelayIdentityService.Identity) session.getAttributes().get(IDENTITY);
        identities.authenticate(session.getHandshakeHeaders().getFirst("Authorization"),
                Long.parseLong(session.getHandshakeHeaders().getFirst("X-Forge-Participant-Id")));
        var parsed = mapper.readTree(text.getPayload());
        if (!(parsed instanceof ObjectNode node) || !COMMANDS.contains(node.path("type").asText())) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        if ("open".equals(node.path("type").asText())) {
            node.remove(java.util.List.of("cwd", "model", "apiBaseUrl", "authToken", "codexHome", "consultEvidenceSystems"));
            node.put("projectKey", identity.projectKey());
            node.put("assistantAppId", identity.projectKey());
            node.put("engine", "codex");
            node.put("mode", "plan");
        }
        if (node.has("appId")) node.put("appId", identity.projectKey());
        handler.handleMessage(session, new TextMessage(mapper.writeValueAsString(node)));
    }

    @Override public void handleTransportError(WebSocketSession session, Throwable error) throws Exception { handler.handleTransportError(session, error); }
    @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception { handler.afterConnectionClosed(session, status); }
    @Override public boolean supportsPartialMessages() { return false; }
}
