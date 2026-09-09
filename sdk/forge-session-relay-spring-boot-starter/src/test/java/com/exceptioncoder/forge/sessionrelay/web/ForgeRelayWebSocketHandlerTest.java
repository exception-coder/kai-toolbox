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
    void sendsUpstreamOriginWithoutTicketOrPath() {
        var upstream = mock(com.exceptioncoder.forge.sessionrelay.support.ForgeRelayUpstreamClient.class);
        var client = mock(org.springframework.web.socket.client.standard.StandardWebSocketClient.class);
        var properties = new com.exceptioncoder.forge.sessionrelay.autoconfigure.ForgeSessionRelayProperties();
        var downstream = openSession();
        when(downstream.getAttributes()).thenReturn(new java.util.HashMap<>());
        var uri = java.net.URI.create("ws://127.0.0.1:28080/api/session-client/v1/ws?ticket=test");
        when(upstream.createWebSocketUri(null)).thenReturn(uri);
        var actualHeaders = new org.springframework.web.socket.WebSocketHttpHeaders();
        actualHeaders.setOrigin("http://127.0.0.1:28080");
        when(upstream.webSocketHeaders(null, uri)).thenReturn(actualHeaders);
        when(client.execute(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(org.springframework.web.socket.WebSocketHttpHeaders.class),
                org.mockito.ArgumentMatchers.eq(uri))).thenReturn(new java.util.concurrent.CompletableFuture<>());

        new ForgeRelayWebSocketHandler(upstream, properties, client).afterConnectionEstablished(downstream);

        var headers = org.mockito.ArgumentCaptor.forClass(org.springframework.web.socket.WebSocketHttpHeaders.class);
        verify(client).execute(org.mockito.ArgumentMatchers.any(), headers.capture(), org.mockito.ArgumentMatchers.eq(uri));
        org.assertj.core.api.Assertions.assertThat(headers.getValue().getOrigin()).isEqualTo("http://127.0.0.1:28080");
    }

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
