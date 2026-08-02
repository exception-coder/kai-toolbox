package com.exceptioncoder.toolbox.common.auth.web;

import com.exceptioncoder.toolbox.common.auth.domain.JwtPayload;
import com.exceptioncoder.toolbox.common.auth.domain.TokenType;
import com.exceptioncoder.toolbox.common.auth.service.JwtService;
import com.exceptioncoder.toolbox.common.development.RequirementDevelopmentAccessPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

/** 仅允许 ADMIN 或指定 PRD 对应需求负责人进入的 Vibe Coding 握手入口。 */
@Component
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class PrdDevelopmentHandshakeInterceptor implements HandshakeInterceptor {

    public static final String PRD_SESSION_ATTRIBUTE = "prdDevelopmentSessionId";
    private static final Logger log = LoggerFactory.getLogger(PrdDevelopmentHandshakeInterceptor.class);

    private final JwtService jwtService;
    private final ObjectProvider<RequirementDevelopmentAccessPolicy> accessPolicy;

    public PrdDevelopmentHandshakeInterceptor(
            JwtService jwtService,
            ObjectProvider<RequirementDevelopmentAccessPolicy> accessPolicy) {
        this.jwtService = jwtService;
        this.accessPolicy = accessPolicy;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        if (!(request instanceof ServletServerHttpRequest servlet)) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }
        String token = servlet.getServletRequest().getParameter("access_token");
        String prdSessionId = servlet.getServletRequest().getParameter("prd_session_id");
        if (token == null || token.isBlank() || prdSessionId == null || prdSessionId.isBlank()) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }
        try {
            JwtPayload payload = jwtService.parse(token);
            if (payload.type() != TokenType.ACCESS) {
                response.setStatusCode(HttpStatus.FORBIDDEN);
                return false;
            }
            boolean admin = payload.roles() != null && payload.roles().contains("ADMIN");
            RequirementDevelopmentAccessPolicy policy = accessPolicy.getIfAvailable();
            if (admin || (policy != null && policy.canDevelop(payload.userId(), prdSessionId.trim()))) {
                attributes.put(PRD_SESSION_ATTRIBUTE, prdSessionId.trim());
                attributes.put("authenticatedUserId", payload.userId());
                return true;
            }
        } catch (RuntimeException e) {
            log.debug("PRD 开发 WS 握手鉴权失败: {}", e.getMessage());
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
