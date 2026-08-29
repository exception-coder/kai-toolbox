package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.service.AssistantWebSocketCommandHandler;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Verifies that one rejected client command cannot tear down the WebSocket session. */
class ClaudeChatWebSocketHandlerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void keepsConnectionOpenAndReturnsStructuredErrorWhenSendIsRejected() throws Exception {
        ClaudeChatService service = mock(ClaudeChatService.class);
        doThrow(new IllegalArgumentException("附件不属于当前评审会话"))
                .when(service).sendUserMessage(any(), any(ClientMessage.Send.class));
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.isOpen()).thenReturn(true);
        ClaudeChatWebSocketHandler handler = new ClaudeChatWebSocketHandler(
                new ClaudeChatProperties(), service, mock(AssistantWebSocketCommandHandler.class), objectMapper);

        handler.handleMessage(session, new TextMessage("""
                {"type":"send","text":"查看附件"}
                """));

        ArgumentCaptor<TextMessage> response = ArgumentCaptor.forClass(TextMessage.class);
        verify(session).sendMessage(response.capture());
        verify(session, never()).close();
        JsonNode payload = objectMapper.readTree(response.getValue().getPayload());
        assertThat(payload.path("type").asText()).isEqualTo("error");
        assertThat(payload.path("code").asText()).isEqualTo("MESSAGE_REJECTED");
        assertThat(payload.path("terminal").asBoolean()).isTrue();
        assertThat(payload.path("message").asText()).contains("附件不属于当前评审会话");
    }

    @Test
    void routesSteerCommandWithoutStartingAnotherTurn() throws Exception {
        ClaudeChatService service = mock(ClaudeChatService.class);
        ClaudeChatWebSocketHandler handler = new ClaudeChatWebSocketHandler(
                new ClaudeChatProperties(), service, mock(AssistantWebSocketCommandHandler.class), objectMapper);
        WebSocketSession session = mock(WebSocketSession.class);

        handler.handleMessage(session, new TextMessage("""
                {"type":"steer","text":"补充检查边界条件","messageId":"message-3"}
                """));

        verify(service).steerUserMessage(any(), any(ClientMessage.Steer.class));
        verify(service, never()).sendUserMessage(any(), any(ClientMessage.Send.class));
    }
}
