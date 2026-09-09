package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionDelegationService;
import java.util.HashMap;
import org.junit.jupiter.api.Test;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.socket.WebSocketHandler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SessionClientHandshakeInterceptorTest {
    @Test
    void acceptsLoopbackOriginAndRejectsForeignOrigin() {
        assertThat(accepts("http://127.0.0.1:28080")).isTrue();
        assertThat(accepts("http://127.0.0.1:18080")).isFalse();
        assertThat(accepts("https://attacker.example")).isFalse();
    }

    private boolean accepts(String origin) {
        var delegations = mock(SessionDelegationService.class);
        when(delegations.consumeConnectionTicket(eq("test"), any())).thenReturn(
                new SessionDelegationService.ConnectionBinding("grant", "session", 1, null, 1));
        var interceptor = new SessionClientHandshakeInterceptor(delegations, new SessionClientProperties());
        var request = new MockHttpServletRequest("GET", "/api/session-client/v1/ws");
        request.setServerName("127.0.0.1");
        request.setServerPort(28080);
        request.addHeader("Host", "127.0.0.1:28080");
        request.addHeader("Origin", origin);
        request.setQueryString("ticket=test&protocolVersion=1.0");
        return interceptor.beforeHandshake(new ServletServerHttpRequest(request),
                new ServletServerHttpResponse(new MockHttpServletResponse()), mock(WebSocketHandler.class), new HashMap<>());
    }
}
