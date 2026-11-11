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
    void userMessageCarriesThePersistedClaudeOptionsWithoutAnEngineConfigurationRace() throws Exception {
        var mapper = new ObjectMapper();
        var client = new SidecarClient(new ClaudeChatProperties(), new ClaudeChatWsProperties(), mapper);
        WebSocketSession connection = mock(WebSocketSession.class);
        when(connection.isOpen()).thenReturn(true);
        ReflectionTestUtils.setField(client, "session", connection);
        client.userMessage("session-1", "任务", null, null, java.util.List.of(), null, null, null,
                java.util.List.of(), null, null, null, false,
                new com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeSessionOptions("max", true));
        var message = org.mockito.ArgumentCaptor.forClass(TextMessage.class);
        org.mockito.Mockito.verify(connection).sendMessage(message.capture());
        var payload = mapper.readTree(message.getValue().getPayload());
        assertThat(payload.path("claudeOptions").path("effort").asText()).isEqualTo("max");
        assertThat(payload.path("claudeOptions").path("ultracode").asBoolean()).isTrue();
    }

    @Test
    void existingUserMessageDoesNotInjectClaudeOptionsIntoCodexRequests() throws Exception {
        var mapper = new ObjectMapper();
        var client = new SidecarClient(new ClaudeChatProperties(), new ClaudeChatWsProperties(), mapper);
        WebSocketSession connection = mock(WebSocketSession.class);
        when(connection.isOpen()).thenReturn(true);
        ReflectionTestUtils.setField(client, "session", connection);
        client.userMessage("session-1", "任务", null, null, java.util.List.of(), null, null, null,
                java.util.List.of(), null, null, null, false);
        var message = org.mockito.ArgumentCaptor.forClass(TextMessage.class);
        org.mockito.Mockito.verify(connection).sendMessage(message.capture());
        assertThat(mapper.readTree(message.getValue().getPayload()).has("claudeOptions")).isFalse();
    }

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
