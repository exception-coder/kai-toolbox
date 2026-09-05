package com.exceptioncoder.forge.sessionrelay.web;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ForgeRelayWebSocketHandlerTest {
    @Test
    void buffersAndFlushesAfterUpstreamConnects() throws Exception {
        WebSocketSession downstream = openSession();
        WebSocketSession upstream = openSession();
        ForgeRelayWebSocketHandler.Bridge bridge = new ForgeRelayWebSocketHandler.Bridge(downstream, 2, 32);
        TextMessage pending = new TextMessage("attach");

        bridge.fromDownstream(pending);
        bridge.attachUpstream(upstream);

        verify(upstream).sendMessage(pending);
    }

    @Test
    void oversizedFrameClosesBothSides() throws Exception {
        WebSocketSession downstream = openSession();
        WebSocketSession upstream = openSession();
        ForgeRelayWebSocketHandler.Bridge bridge = new ForgeRelayWebSocketHandler.Bridge(downstream, 1, 4);
        bridge.attachUpstream(upstream);

        bridge.fromDownstream(new TextMessage("12345"));

        verify(upstream).close(CloseStatus.TOO_BIG_TO_PROCESS);
        verify(downstream).close(CloseStatus.TOO_BIG_TO_PROCESS);
    }

    @Test
    void closePropagatesToBothSides() throws Exception {
        WebSocketSession downstream = openSession();
        WebSocketSession upstream = openSession();
        ForgeRelayWebSocketHandler.Bridge bridge = new ForgeRelayWebSocketHandler.Bridge(downstream, 1, 8);
        bridge.attachUpstream(upstream);

        bridge.close(CloseStatus.GOING_AWAY);

        verify(upstream).close(CloseStatus.GOING_AWAY);
        verify(downstream).close(CloseStatus.GOING_AWAY);
    }

    private static WebSocketSession openSession() {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.isOpen()).thenReturn(true);
        return session;
    }
}
