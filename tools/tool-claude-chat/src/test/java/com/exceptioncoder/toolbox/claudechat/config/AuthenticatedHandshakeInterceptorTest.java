package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.common.auth.domain.JwtPayload;
import com.exceptioncoder.toolbox.common.auth.domain.TokenType;
import com.exceptioncoder.toolbox.common.auth.service.JwtService;
import com.exceptioncoder.toolbox.common.auth.web.AuthenticatedHandshakeInterceptor;
import org.junit.jupiter.api.Test;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.socket.WebSocketHandler;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthenticatedHandshakeInterceptorTest {

    private final JwtService jwtService = mock(JwtService.class);
    private final AuthenticatedHandshakeInterceptor interceptor =
            new AuthenticatedHandshakeInterceptor(jwtService);
    private final WebSocketHandler handler = mock(WebSocketHandler.class);

    @Test
    void allowsValidAccessTokenWithoutAdminRole() {
        when(jwtService.parse("user-token")).thenReturn(new JwtPayload(
                7L, "yuy", List.of("USER"), List.of(), "jti", TokenType.ACCESS,
                System.currentTimeMillis() + 60_000));

        Exchange exchange = exchange("user-token");

        assertThat(interceptor.beforeHandshake(
                exchange.request(), exchange.response(), handler, Map.of())).isTrue();
    }

    @Test
    void rejectsRefreshToken() {
        when(jwtService.parse("refresh-token")).thenReturn(new JwtPayload(
                7L, "yuy", List.of("USER"), List.of(), "jti", TokenType.REFRESH,
                System.currentTimeMillis() + 60_000));

        Exchange exchange = exchange("refresh-token");

        assertThat(interceptor.beforeHandshake(
                exchange.request(), exchange.response(), handler, Map.of())).isFalse();
        assertThat(exchange.servletResponse().getStatus()).isEqualTo(403);
    }

    @Test
    void rejectsMissingToken() {
        Exchange exchange = exchange(null);

        assertThat(interceptor.beforeHandshake(
                exchange.request(), exchange.response(), handler, Map.of())).isFalse();
        assertThat(exchange.servletResponse().getStatus()).isEqualTo(403);
    }

    private static Exchange exchange(String token) {
        MockHttpServletRequest servletRequest = new MockHttpServletRequest();
        if (token != null) {
            servletRequest.setParameter("access_token", token);
        }
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();
        return new Exchange(
                new ServletServerHttpRequest(servletRequest),
                new ServletServerHttpResponse(servletResponse),
                servletResponse);
    }

    private record Exchange(
            ServletServerHttpRequest request,
            ServletServerHttpResponse response,
            MockHttpServletResponse servletResponse) {
    }
}
