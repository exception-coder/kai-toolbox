package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatWsProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SidecarClientConnectionTest {
    @Test
    void shouldIgnoreFramesFromAReplacedConnection() throws Exception {
        var client = new SidecarClient(new ClaudeChatProperties(), new ClaudeChatWsProperties(), new ObjectMapper());
        WebSocketSession current = mock(WebSocketSession.class);
        WebSocketSession stale = mock(WebSocketSession.class);
        when(current.getId()).thenReturn("current");
        when(stale.getId()).thenReturn("stale");
        ReflectionTestUtils.setField(client, "session", current);
        var calls = new AtomicInteger();
        client.setListener((session, node) -> calls.incrementAndGet());
        var constructor = Class.forName(SidecarClient.class.getName() + "$ClientHandler")
                .getDeclaredConstructor(SidecarClient.class);
        constructor.setAccessible(true);
        var handler = (WebSocketHandler) constructor.newInstance(client);
        var message = new TextMessage("{\"type\":\"assistantDelta\",\"sessionId\":\"session-1\",\"text\":\"reply\"}");
        handler.handleMessage(stale, message);
        assertThat(calls.get()).isZero();
        handler.handleMessage(current, message);
        assertThat(calls.get()).isEqualTo(1);
    }
}
