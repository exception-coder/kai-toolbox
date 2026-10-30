package com.exceptioncoder.toolbox.claudechat.config;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatAttachmentRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.exceptioncoder.toolbox.claudechat.service.ConsultClientTickets;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.llm.spi.ConsultClientApplication;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpHeaders;
import org.springframework.web.socket.*;

class ConsultClientWebSocketHandlerTest {

    private final ConsultClientTickets tickets = mock(
        ConsultClientTickets.class
    );
    private final ConsultClientApplication app = mock(
        ConsultClientApplication.class
    );
    private final ClaudeChatService chat = mock(ClaudeChatService.class);
    private final WebSocketSession socket = mock(WebSocketSession.class);
    private final List<String> output = new ArrayList<>();
    private ConsultClientWebSocketHandler handler;

    @BeforeEach
    void setUp() throws Exception {
        when(tickets.enabled()).thenReturn(true);
        when(tickets.consume("ticket", null)).thenReturn(
            new AuthPrincipal(
                7,
                "user",
                List.of(),
                List.of(),
                "jwt",
                Long.MAX_VALUE
            )
        );
        when(socket.getId()).thenReturn("connection");
        when(socket.getAttributes()).thenReturn(new HashMap<>());
        when(socket.getHandshakeHeaders()).thenReturn(new HttpHeaders());
        when(socket.isOpen()).thenReturn(true);
        when(socket.getUri()).thenReturn(
            URI.create("wss://forge.test/api/fore-consult/client/ws")
        );
        doAnswer(invocation -> {
            output.add(((TextMessage) invocation.getArgument(0)).getPayload());
            return null;
        })
            .when(socket)
            .sendMessage(any());
        handler = new ConsultClientWebSocketHandler(
            tickets,
            app,
            chat,
            mock(ClaudeChatAttachmentRepository.class),
            new ObjectMapper(),
            mock(
                com.exceptioncoder.toolbox.claudechat.repository
                    .ConsultRuntimeRepository.class
            )
        );
        handler.afterConnectionEstablished(socket);
    }

    private void send(String json) throws Exception {
        handler.handleMessage(socket, new TextMessage(json));
    }

    private void auth() throws Exception {
        send("{\"type\":\"auth\",\"ticket\":\"ticket\"}");
    }

    @Test
    void unauthenticatedAndDevelopmentCommandsNeverReachEngine()
        throws Exception {
        send("{\"type\":\"consult.ask\"}");
        verifyNoInteractions(chat, app);
        auth();
        send("{\"type\":\"setAutoApprove\",\"enabled\":true}");
        verifyNoInteractions(chat, app);
    }

    @Test
    void questionUsesBusinessPortAndPrivateEventsAreNotForwarded()
        throws Exception {
        auth();
        when(app.prepare("request-123", null, "问题", List.of())).thenReturn(
            new ConsultClientApplication.Prepared(
                new ConsultClientApplication.Bound(
                    "consult",
                    "runtime",
                    "标题",
                    "PENDING"
                ),
                "server-only instructions"
            )
        );
        doAnswer(invocation -> {
            WebSocketSession target = invocation.getArgument(0);
            target.sendMessage(
                new TextMessage(
                    "{\"type\":\"toolUse\",\"input\":\"secret path and password\"}"
                )
            );
            target.sendMessage(
                new TextMessage(
                    "{\"type\":\"assistantDelta\",\"seq\":1,\"text\":\"回答\"}"
                )
            );
            target.sendMessage(
                new TextMessage(
                    "{\"type\":\"error\",\"message\":\"private stack and token\"}"
                )
            );
            return null;
        })
            .when(chat)
            .sendUserMessage(any(), any());
        send(
            "{\"type\":\"consult.ask\",\"requestId\":\"request-123\",\"question\":\"问题\"}"
        );
        verify(chat).sendUserMessage(
            any(),
            argThat(
                (ClientMessage.Send value) ->
                    value.text().equals("server-only instructions") &&
                    value.developerInstructions() == null
            )
        );
        assertThat(String.join("\n", output))
            .contains("accepted", "answer.delta", "回答")
            .doesNotContain("private", "password", "server-only");
        send(
            "{\"type\":\"consult.ask\",\"requestId\":\"request-456\",\"consultationId\":\"other\",\"question\":\"另一问题\"}"
        );
        verify(app, times(1)).prepare(any(), any(), any(), any());
    }

    @Test
    void attachmentFromAnotherConsultationIsRejected() throws Exception {
        auth();
        when(app.require("consult", true)).thenReturn(
            new ConsultClientApplication.Bound(
                "consult",
                "runtime",
                "title",
                "PENDING"
            )
        );
        send(
            "{\"type\":\"consult.ask\",\"consultationId\":\"consult\",\"requestId\":\"request-123\",\"question\":\"问题\",\"attachmentIds\":[\"other-file\"]}"
        );
        verify(app, never()).prepare(any(), any(), any(), any());
        verifyNoInteractions(chat);
    }
}
