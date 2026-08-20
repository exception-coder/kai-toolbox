package com.exceptioncoder.toolbox.common.auth.web;

import com.exceptioncoder.toolbox.common.auth.domain.JwtPayload;
import com.exceptioncoder.toolbox.common.auth.domain.TokenType;
import com.exceptioncoder.toolbox.common.auth.service.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.socket.WebSocketHandler;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 管理员 WebSocket 握手认证主体透传测试。 */
class AdminHandshakeInterceptorTest {

    @Test
    void storesAuthenticatedAdminPrincipalInHandshakeAttributes() {
        JwtService jwtService = mock(JwtService.class);
        long expiresAt = System.currentTimeMillis() + 60_000;
        when(jwtService.parse("admin-token")).thenReturn(new JwtPayload(
                2L, "admin", List.of("ADMIN"), List.of("session:read"), "jti", TokenType.ACCESS,
                expiresAt));
        AdminHandshakeInterceptor interceptor = new AdminHandshakeInterceptor(jwtService);
        MockHttpServletRequest servletRequest = new MockHttpServletRequest();
        servletRequest.setParameter("access_token", "admin-token");
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();
        Map<String, Object> attributes = new HashMap<>();

        boolean allowed = interceptor.beforeHandshake(
                new ServletServerHttpRequest(servletRequest),
                new ServletServerHttpResponse(servletResponse),
                mock(WebSocketHandler.class),
                attributes);

        assertThat(allowed).isTrue();
        assertThat(attributes.get(AuthenticatedHandshakeInterceptor.AUTH_PRINCIPAL_ATTRIBUTE))
                .isEqualTo(new AuthPrincipal(
                        2L, "admin", List.of("ADMIN"), List.of("session:read"), "jti", expiresAt));
    }

    @Test
    void rejectsAuthenticatedUserWithoutAdminRole() {
        JwtService jwtService = mock(JwtService.class);
        long expiresAt = System.currentTimeMillis() + 60_000;
        when(jwtService.parse("user-token")).thenReturn(new JwtPayload(
                7L, "user", List.of("USER"), List.of("session:read"), "jti", TokenType.ACCESS,
                expiresAt));
        AdminHandshakeInterceptor interceptor = new AdminHandshakeInterceptor(jwtService);
        MockHttpServletRequest servletRequest = new MockHttpServletRequest();
        servletRequest.setParameter("access_token", "user-token");
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();
        Map<String, Object> attributes = new HashMap<>();

        boolean allowed = interceptor.beforeHandshake(
                new ServletServerHttpRequest(servletRequest),
                new ServletServerHttpResponse(servletResponse),
                mock(WebSocketHandler.class),
                attributes);

        assertThat(allowed).isFalse();
        assertThat(servletResponse.getStatus()).isEqualTo(403);
        assertThat(attributes).doesNotContainKey(AuthenticatedHandshakeInterceptor.AUTH_PRINCIPAL_ATTRIBUTE);
    }
}
