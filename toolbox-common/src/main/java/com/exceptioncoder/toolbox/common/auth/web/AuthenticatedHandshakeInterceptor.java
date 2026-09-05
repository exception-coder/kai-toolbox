package com.exceptioncoder.toolbox.common.auth.web;

import com.exceptioncoder.toolbox.common.auth.domain.JwtPayload;
import com.exceptioncoder.toolbox.common.auth.domain.TokenType;
import com.exceptioncoder.toolbox.common.auth.service.JwtService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

/**
 * WebSocket 握手阶段的登录鉴权拦截器。
 *
 * <p>用于业务咨询这类允许普通登录用户使用、但不能匿名访问的 WS。只接受有效的 ACCESS token，
 * 不要求 ADMIN 角色；管理员专用通道仍使用 {@link AdminHandshakeInterceptor}。</p>
 */
@Component
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class AuthenticatedHandshakeInterceptor implements HandshakeInterceptor {

    public static final String AUTH_PRINCIPAL_ATTRIBUTE = "toolbox.auth.principal";

    private static final Logger log = LoggerFactory.getLogger(AuthenticatedHandshakeInterceptor.class);

    private final JwtService jwtService;

    public AuthenticatedHandshakeInterceptor(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String token = request instanceof ServletServerHttpRequest servlet
                ? servlet.getServletRequest().getParameter("access_token")
                : null;
        String origin = request.getHeaders().getOrigin();
        String forwardedFor = request.getHeaders().getFirst("X-Forwarded-For");
        String cloudflareRay = request.getHeaders().getFirst("CF-Ray");
        if (token != null && !token.isBlank()) {
            try {
                JwtPayload payload = jwtService.parse(token);
                if (payload.type() == TokenType.ACCESS) {
                    attributes.put(AUTH_PRINCIPAL_ATTRIBUTE, new AuthPrincipal(
                            payload.userId(), payload.username(), payload.roles(), payload.permissionCodes(),
                            payload.jti(), payload.expiresAt()));
                    log.info("WS 握手鉴权通过 path={} userId={} origin={} forwardedFor={} cfRay={}",
                            request.getURI().getPath(), payload.userId(), origin, forwardedFor, cloudflareRay);
                    return true;
                }
                log.warn("WS 握手拒绝 path={} reason=token_type_{} origin={} forwardedFor={} cfRay={}",
                        request.getURI().getPath(), payload.type(), origin, forwardedFor, cloudflareRay);
            } catch (RuntimeException e) {
                log.warn("WS 握手拒绝 path={} reason=token_invalid exception={} origin={} forwardedFor={} cfRay={}",
                        request.getURI().getPath(), e.getClass().getSimpleName(), origin, forwardedFor, cloudflareRay);
            }
        } else {
            log.warn("WS 握手拒绝 path={} reason=token_missing origin={} forwardedFor={} cfRay={}",
                    request.getURI().getPath(), origin, forwardedFor, cloudflareRay);
        }
        response.setStatusCode(HttpStatus.FORBIDDEN);
        return false;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        // no-op
    }
}
