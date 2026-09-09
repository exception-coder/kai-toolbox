package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.service.CapsuleRelayIdentityService;
import com.exceptioncoder.toolbox.claudechat.service.SessionExecutionPolicy;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.HashMap;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class CapsuleRelayGatewayTest {
    @Test
    void pinsProjectAndRejectsDevelopmentCommands() throws Exception {
        var identities = mock(CapsuleRelayIdentityService.class);
        var handler = mock(ClaudeChatWebSocketHandler.class);
        var mapper = new ObjectMapper();
        var gateway = new CapsuleRelayGateway(identities, handler, mapper);
        var headers = new HttpHeaders();
        headers.set("Authorization", "Basic test");
        headers.set("X-Forge-Participant-Id", "12");
        var identity = new CapsuleRelayIdentityService.Identity("yoooni-one",
                new AuthPrincipal(101L, "capsule-test", List.of(), List.of(), "capsule", 9999999999L));
        when(identities.authenticate("Basic test", 12)).thenReturn(identity);
        var attributes = new HashMap<String, Object>();
        var request = mock(ServerHttpRequest.class);
        when(request.getHeaders()).thenReturn(headers);
        assertThat(gateway.beforeHandshake(request, mock(ServerHttpResponse.class), handler, attributes)).isTrue();
        var session = mock(WebSocketSession.class);
        when(session.getAttributes()).thenReturn(attributes);
        when(session.getHandshakeHeaders()).thenReturn(headers);
        gateway.handleMessage(session, new TextMessage("{\"type\":\"open\",\"projectKey\":\"other\",\"cwd\":\"/secret\",\"mode\":\"agent\",\"authToken\":\"secret\"}"));
        var forwarded = org.mockito.ArgumentCaptor.forClass(TextMessage.class);
        verify(handler).handleMessage(eq(session), forwarded.capture());
        var json = mapper.readTree(forwarded.getValue().getPayload());
        assertThat(json.path("projectKey").asText()).isEqualTo("yoooni-one");
        assertThat(json.path("mode").asText()).isEqualTo("plan");
        assertThat(json.has("cwd")).isFalse();
        assertThat(json.has("authToken")).isFalse();
        assertThat(SessionExecutionPolicy.forWebSocket(URI.create("ws://localhost" + CapsuleRelayGateway.PATH)))
                .isEqualTo(SessionExecutionPolicy.CONSULT_READONLY);
        gateway.handleMessage(session, new TextMessage("{\"type\":\"setMode\",\"mode\":\"agent\"}"));
        verify(session).close(CloseStatus.POLICY_VIOLATION);
        verifyNoMoreInteractions(handler);
    }

    @Test
    void refusesInvalidClientBeforeOpening() {
        var identities = mock(CapsuleRelayIdentityService.class);
        var request = mock(ServerHttpRequest.class);
        var headers = new HttpHeaders();
        headers.set("Authorization", "Basic invalid");
        headers.set("X-Forge-Participant-Id", "12");
        when(request.getHeaders()).thenReturn(headers);
        when(identities.authenticate("Basic invalid", 12)).thenThrow(new IllegalArgumentException());
        var response = mock(ServerHttpResponse.class);
        assertThat(new CapsuleRelayGateway(identities, mock(ClaudeChatWebSocketHandler.class), new ObjectMapper())
                .beforeHandshake(request, response, null, new HashMap<>())).isFalse();
        verify(response).setStatusCode(org.springframework.http.HttpStatus.FORBIDDEN);
    }
}
