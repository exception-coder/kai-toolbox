package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.common.assistant.AssistantCapabilityPort;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.auth.web.AuthenticatedHandshakeInterceptor;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Assistant 业务命令经统一 WS 调用时的认证与响应契约测试。 */
class AssistantWebSocketCommandHandlerTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @AfterEach
    void clearAuthContext() {
        AuthContext.clear();
    }

    @Test
    void bindsHandshakePrincipalWhileCallingCapability() throws Exception {
        AssistantCapabilityPort capability = mock(AssistantCapabilityPort.class);
        when(capability.routeIntent("AUTO", "订单为什么无法审核"))
                .thenAnswer(ignored -> new AssistantCapabilityPort.IntentResult(
                        "QUESTION", 0.9D, "user=" + AuthContext.current().orElseThrow().userId()));
        @SuppressWarnings("unchecked")
        ObjectProvider<AssistantCapabilityPort> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(capability);
        AssistantWebSocketCommandHandler handler = new AssistantWebSocketCommandHandler(provider, mapper);
        WebSocketSession ws = authenticatedSocket(7L);

        handler.handle(ws, new ClientMessage.AssistantIntentRoute(
                "request-1", "AUTO", "订单为什么无法审核"));

        verify(capability).routeIntent("AUTO", "订单为什么无法审核");
        org.mockito.ArgumentCaptor<TextMessage> response = org.mockito.ArgumentCaptor.forClass(TextMessage.class);
        verify(ws).sendMessage(response.capture());
        JsonNode json = mapper.readTree(response.getValue().getPayload());
        assertThat(json.path("type").asText()).isEqualTo("assistantCommandResult");
        assertThat(json.path("data").path("reason").asText()).isEqualTo("user=7");
        assertThat(AuthContext.current()).isEmpty();
    }

    private WebSocketSession authenticatedSocket(long userId) {
        WebSocketSession ws = mock(WebSocketSession.class);
        AuthPrincipal principal = new AuthPrincipal(userId, "user", List.of("USER"), List.of(), "jti", 1L);
        when(ws.getAttributes()).thenReturn(Map.of(
                AuthenticatedHandshakeInterceptor.AUTH_PRINCIPAL_ATTRIBUTE, principal));
        when(ws.isOpen()).thenReturn(true);
        return ws;
    }
}
