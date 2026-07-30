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
        if (token != null && !token.isBlank()) {
            try {
                JwtPayload payload = jwtService.parse(token);
                if (payload.type() == TokenType.ACCESS) {
                    return true;
                }
            } catch (RuntimeException e) {
                log.debug("WS 握手 token 校验失败: {}", e.getMessage());
            }
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
