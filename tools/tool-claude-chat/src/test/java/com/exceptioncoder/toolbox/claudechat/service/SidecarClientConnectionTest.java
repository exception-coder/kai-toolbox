package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatWsProperties;
import com.exceptioncoder.toolbox.llm.spi.AgentToolAssemblyProvider;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SidecarClientConnectionTest {
    @Test
    void handshakeDeadlineClosesLateConnectionWithoutAdoptingIt() throws Exception {
        var properties = new ClaudeChatProperties();
        properties.setSidecarStartupTimeoutMs(200);
        var client = new SidecarClient(properties, new ClaudeChatWsProperties(), new ObjectMapper());
        var transport = mock(StandardWebSocketClient.class);
        var handshake = new CompletableFuture<WebSocketSession>();
        when(transport.execute(any(WebSocketHandler.class), anyString())).thenReturn(handshake);
        ReflectionTestUtils.setField(client, "client", transport);
        assertThatThrownBy(client::ensureConnected).isInstanceOf(IOException.class).hasCauseInstanceOf(TimeoutException.class);
        var late = mock(WebSocketSession.class);
        handshake.complete(late);
        verify(late).close();
        assertThat(client.isConnected()).isFalse();
    }

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
    void onlyTheBoundConsultationAssemblyReceivesTheSeparateBrowserInput() throws Exception {
        var mapper = new ObjectMapper();
        var client = new SidecarClient(new ClaudeChatProperties(), new ClaudeChatWsProperties(), mapper);
        var connection = mock(WebSocketSession.class);
        when(connection.isOpen()).thenReturn(true);
        ReflectionTestUtils.setField(client, "session", connection);
        AgentToolAssemblyProvider provider = id -> Optional.of(new AgentToolAssemblyProvider.Assembly(
                List.of("browser_open_and_click"), List.of("forge_browser"), "平台装配"));
        ReflectionTestUtils.setField(client, "toolAssemblyProviders", List.of(provider));
        var browser = new ConsultRuntimeCoordinator.BrowserInput("点击 Domains", null, "https://www.iana.org/help/example-domains");
        client.userMessage("consult", "历史拼接后的模型输入", "客户端提供的提示", null, List.of(),
                "turn", null, null, List.of(), null, null, Map.of("segmentId", "segment"), false, null, browser);
        client.userMessage("other", "其他会话输入", null, null, List.of(), "turn", null, null,
                List.of(), null, null, null, false, null, browser);
        var messages = org.mockito.ArgumentCaptor.forClass(TextMessage.class);
        verify(connection, org.mockito.Mockito.times(2)).sendMessage(messages.capture());
        var assembly = mapper.readTree(messages.getAllValues().getFirst().getPayload()).path("consultToolAssembly");
        assertThat(assembly.path("browserUserRequest").asText()).isEqualTo(browser.userRequest());
        assertThat(assembly.path("browserCurrentPageUrl").asText()).isEqualTo(browser.currentPageUrl());
        assertThat(assembly.has("previousBrowserUserRequest")).isFalse();
        var other = mapper.readTree(messages.getAllValues().getLast().getPayload()).path("consultToolAssembly");
        assertThat(other.has("browserUserRequest")).isFalse();
        assertThat(other.has("previousBrowserUserRequest")).isFalse();
        assertThat(other.has("browserCurrentPageUrl")).isFalse();
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
