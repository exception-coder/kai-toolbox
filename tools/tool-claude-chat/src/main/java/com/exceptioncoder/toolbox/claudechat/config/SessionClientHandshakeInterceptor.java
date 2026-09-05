package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientProtocol;
import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionDelegationService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Instant;
import java.util.Map;

/** 消费单次 ticket，并把不可变 Grant 绑定放入公共 WebSocket 握手属性。 */
@Component
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class SessionClientHandshakeInterceptor implements HandshakeInterceptor {

    public static final String BINDING_ATTRIBUTE = "session-client.binding";
    public static final String SESSION_VERSION_ATTRIBUTE = "session-client.session-version";

    private final SessionDelegationService delegations;
    private final SessionClientProperties properties;

    public SessionClientHandshakeInterceptor(SessionDelegationService delegations,
                                             SessionClientProperties properties) {
        this.delegations = delegations;
        this.properties = properties;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler handler, Map<String, Object> attributes) {
        if (!properties.isEnabled()) return reject(response, HttpStatus.NOT_FOUND);
        Map<String, String> query = UriComponentsBuilder.fromUri(request.getURI()).build()
                .getQueryParams().toSingleValueMap();
        if (!SessionClientProtocol.SUPPORTED_VERSIONS.contains(query.get("protocolVersion"))) {
            return reject(response, HttpStatus.UPGRADE_REQUIRED);
        }
        if (!originAllowed(request)) return reject(response, HttpStatus.FORBIDDEN);
        try {
            SessionDelegationService.ConnectionBinding binding = delegations.consumeConnectionTicket(
                    query.get("ticket"), Instant.now());
            attributes.put(BINDING_ATTRIBUTE, binding);
            attributes.put(SESSION_VERSION_ATTRIBUTE, binding.sessionVersion());
            return true;
        } catch (RuntimeException ignored) {
            return reject(response, HttpStatus.UNAUTHORIZED);
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler handler, Exception exception) {
        // 无清理动作；ticket 已原子消费。
    }

    private boolean originAllowed(ServerHttpRequest request) {
        String origin = request.getHeaders().getOrigin();
        if (origin == null || origin.isBlank()) return false;
        try {
            java.net.URI originUri = java.net.URI.create(origin);
            if (!secureOrLoopback(originUri)) return false;
            if (!properties.getAllowedOrigins().isEmpty()) {
                return properties.getAllowedOrigins().stream().anyMatch(origin::equals);
            }
            String requestHost = request.getHeaders().getHost() == null
                    ? request.getURI().getAuthority() : request.getHeaders().getHost().toString();
            return requestHost != null && requestHost.equalsIgnoreCase(originUri.getAuthority());
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private static boolean secureOrLoopback(java.net.URI origin) {
        if ("https".equalsIgnoreCase(origin.getScheme())) return true;
        String host = origin.getHost();
        return "http".equalsIgnoreCase(origin.getScheme()) && host != null
                && ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host) || "::1".equals(host));
    }

    private static boolean reject(ServerHttpResponse response, HttpStatus status) {
        response.setStatusCode(status);
        return false;
    }
}
