package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.service.CapsuleRelayIdentityService;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class CapsuleRelayBoundaryTest {
    private final CapsuleRelayIdentityService identities = mock(CapsuleRelayIdentityService.class);
    private final ClaudeChatWebSocketHandler handler = mock(ClaudeChatWebSocketHandler.class);
    private final CapsuleRelayGateway gateway = new CapsuleRelayGateway(identities, handler, new ObjectMapper());
    private final HttpHeaders headers = new HttpHeaders();

    private WebSocketSession connect() {
        headers.set("Authorization", "Basic host");
        headers.set("X-Forge-Participant-Id", "12");
        when(identities.authenticate("Basic host", 12)).thenReturn(new CapsuleRelayIdentityService.Identity(
                "yoooni-one", new AuthPrincipal(101, "capsule", List.of(), List.of(), "capsule", 9999999999L)));
        var request = mock(ServerHttpRequest.class);
        when(request.getHeaders()).thenReturn(headers);
        var attributes = new HashMap<String, Object>();
        assertThat(gateway.beforeHandshake(request, mock(ServerHttpResponse.class), handler, attributes)).isTrue();
        var session = mock(WebSocketSession.class);
        when(session.getHandshakeHeaders()).thenReturn(headers);
        when(session.getAttributes()).thenReturn(attributes);
        return session;
    }

    @Test
    void revokedHostClosesBeforeForwarding() throws Exception {
        var session = connect();
        when(identities.authenticate("Basic host", 12)).thenThrow(new IllegalArgumentException("revoked"));
        gateway.handleMessage(session, new TextMessage("{\"type\":\"send\",\"text\":\"hello\"}"));
        verify(session).close(CloseStatus.POLICY_VIOLATION);
        verifyNoInteractions(handler);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{", "[]", "{\"type\":\"setAutoApprove\"}", "{\"type\":\"decision\"}",
            "{\"type\":\"switchEngine\"}", "{\"type\":\"assistantDraftConfirm\"}"})
    void rejectsMalformedOrDevelopmentCommands(String payload) throws Exception {
        var session = connect();
        gateway.handleMessage(session, new TextMessage(payload));
        verify(session).close(CloseStatus.POLICY_VIOLATION);
        verifyNoInteractions(handler);
    }

    @Test
    void rejectsOversizedMessage() throws Exception {
        var session = connect();
        gateway.handleMessage(session, new TextMessage("x".repeat(256 * 1024 + 1)));
        verify(session).close(CloseStatus.POLICY_VIOLATION);
        verifyNoInteractions(handler);
    }

    @Test
    void missingParticipantHeaderRejectsHandshake() {
        var request = mock(ServerHttpRequest.class);
        when(request.getHeaders()).thenReturn(headers);
        var response = mock(ServerHttpResponse.class);
        assertThat(gateway.beforeHandshake(request, response, handler, new HashMap<>())).isFalse();
        verify(response).setStatusCode(HttpStatus.FORBIDDEN);
        verifyNoInteractions(identities);
    }
}
