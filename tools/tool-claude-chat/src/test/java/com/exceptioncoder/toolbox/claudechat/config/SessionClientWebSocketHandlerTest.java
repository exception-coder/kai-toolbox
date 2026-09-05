package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionClientCommand;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionClientEvent;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientProtocol;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionDelegationProfile;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionClientCommandService;
import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionClientConnectionRegistry;
import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionDelegationService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionClientWebSocketHandlerTest {

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void rejectsUnknownCommandWithoutDispatchingInternalProtocol() throws Exception {
        Fixture fixture = fixture();

        fixture.handler().handleTextMessage(fixture.session(), new TextMessage("""
                {"type":"approveTool","requestId":"private-request"}
                """));

        JsonNode payload = response(fixture.session());
        assertThat(payload.path("type").asText()).isEqualTo("error");
        assertThat(payload.path("error").path("code").asText()).isEqualTo("COMMAND_UNSUPPORTED");
    }

    @Test
    void requiresAttachBeforeBusinessCommands() throws Exception {
        Fixture fixture = fixture();

        fixture.handler().handleTextMessage(fixture.session(), new TextMessage("""
                {"type":"acknowledge","commandId":"cmd-1","expectedSessionVersion":7,"eventSeq":12}
                """));

        JsonNode payload = response(fixture.session());
        assertThat(payload.path("error").path("code").asText()).isEqualTo("INVALID_INPUT");
    }

    @Test
    void attachesBoundSessionAtRequestedReplayWatermarkThenDispatchesCommand() throws Exception {
        Fixture fixture = fixture();
        SessionClientEvent accepted = SessionClientEvent.data(SessionClientProtocol.VERSION,
                "commandAccepted", 0, 7, new SessionClientEvent.CommandAccepted("cmd-2", "acknowledge", 0));
        when(fixture.commands().acknowledge(any(), any(SessionClientCommand.Acknowledge.class), any()))
                .thenReturn(accepted);

        fixture.handler().handleTextMessage(fixture.session(), new TextMessage("""
                {"type":"attach","protocolVersion":"1.0","lastEventSeq":41}
                """));
        fixture.handler().handleTextMessage(fixture.session(), new TextMessage("""
                {"type":"acknowledge","commandId":"cmd-2","expectedSessionVersion":7,"eventSeq":43}
                """));

        verify(fixture.chat()).attach(fixture.session(), new ClientMessage.Attach("session-1", 41));
        verify(fixture.commands()).acknowledge(any(), any(SessionClientCommand.Acknowledge.class), any());
        JsonNode payload = response(fixture.session());
        assertThat(payload.path("type").asText()).isEqualTo("commandAccepted");
    }

    private Fixture fixture() {
        ClaudeChatService chat = mock(ClaudeChatService.class);
        SessionClientCommandService commands = mock(SessionClientCommandService.class);
        SessionClientConnectionRegistry connections = mock(SessionClientConnectionRegistry.class);
        WebSocketSession session = mock(WebSocketSession.class);
        Map<String, Object> attributes = new HashMap<>();
        attributes.put(SessionClientHandshakeInterceptor.BINDING_ATTRIBUTE,
                new SessionDelegationService.ConnectionBinding("grant-1", "session-1", 12,
                        SessionDelegationProfile.DELEGATED_DEVELOPMENT, 7));
        attributes.put(SessionClientHandshakeInterceptor.SESSION_VERSION_ATTRIBUTE, 7L);
        when(session.getAttributes()).thenReturn(attributes);
        when(session.isOpen()).thenReturn(true);
        return new Fixture(new SessionClientWebSocketHandler(chat, commands, connections, mapper),
                session, chat, commands);
    }

    private JsonNode response(WebSocketSession session) throws Exception {
        ArgumentCaptor<TextMessage> response = ArgumentCaptor.forClass(TextMessage.class);
        verify(session).sendMessage(response.capture());
        return mapper.readTree(response.getValue().getPayload());
    }

    private record Fixture(SessionClientWebSocketHandler handler, WebSocketSession session,
                           ClaudeChatService chat, SessionClientCommandService commands) {
    }
}
