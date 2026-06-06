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
 * WebSocket 握手阶段的 ADMIN 鉴权拦截器。MVC 的 HandlerInterceptor 管不到 WS 握手，
 * 故对需要管理员的 WS（如 Web 终端）在握手时校验：从 {@code access_token} 查询参数取 JWT，
 * 必须是有效 ACCESS token 且含 ADMIN 角色，否则拒绝握手（403）。
 *
 * <p>仅在 {@code toolbox.auth.enabled=true} 时存在；关闭鉴权时本 bean 不加载，WS 不拦。</p>
 */
@Component
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class AdminHandshakeInterceptor implements HandshakeInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AdminHandshakeInterceptor.class);
    private static final String ADMIN = "ADMIN";

    private final JwtService jwtService;

    public AdminHandshakeInterceptor(JwtService jwtService) {
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
                if (payload.type() == TokenType.ACCESS && payload.roles() != null && payload.roles().contains(ADMIN)) {
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
