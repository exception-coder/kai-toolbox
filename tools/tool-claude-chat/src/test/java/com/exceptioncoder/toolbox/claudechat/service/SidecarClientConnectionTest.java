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
        var browser = new ConsultRuntimeCoordinator.BrowserInput("点击 Domains", null, "https://www.iana.org/help/example-domains");
        var sameSite = new ConsultRuntimeCoordinator.BrowserInput("打开 https://erp.example.test/app/menu", null, null);
        var followUp = new ConsultRuntimeCoordinator.BrowserInput("点击菜单", null, "https://erp.example.test/app/");
        var provider = mock(AgentToolAssemblyProvider.class);
        var publicAssembly = new AgentToolAssemblyProvider.Assembly(
                List.of("browser_open_and_click"), List.of("forge_browser"), "平台装配", null, true, true);
        var boundAssembly = new AgentToolAssemblyProvider.Assembly(
                List.of("browser_open_and_click"), List.of("forge_browser"), "平台装配", null, true);
        when(provider.resolve("consult", browser.userRequest(), browser.currentPageUrl())).thenReturn(Optional.of(publicAssembly));
        when(provider.resolve("consult", sameSite.userRequest(), null)).thenReturn(Optional.of(boundAssembly));
        when(provider.resolve("consult", followUp.userRequest(), followUp.currentPageUrl())).thenReturn(Optional.of(boundAssembly));
        when(provider.resolve("other", null, browser.currentPageUrl())).thenReturn(Optional.of(publicAssembly));
        ReflectionTestUtils.setField(client, "toolAssemblyProviders", List.of(provider));
        client.userMessage("consult", "历史拼接后的模型输入", "客户端提供的提示", null, List.of(),
                "turn", null, null, List.of(), null, null, Map.of("segmentId", "segment"), false, null, browser, browser.userRequest());
        for (var input : List.of(sameSite, followUp)) {
            client.userMessage("consult", input.userRequest(), null, null, List.of(), "turn", null, null,
                    List.of(), null, null, Map.of("segmentId", "segment"), false, null, input, input.userRequest());
        }
        client.userMessage("other", "其他会话输入", null, null, List.of(), "turn", null, null,
                List.of(), null, null, null, false, null, browser, null);
        var messages = org.mockito.ArgumentCaptor.forClass(TextMessage.class);
        verify(connection, org.mockito.Mockito.times(4)).sendMessage(messages.capture());
        var assembly = mapper.readTree(messages.getAllValues().getFirst().getPayload()).path("consultToolAssembly");
        assertThat(assembly.path("managedWebAccount").asBoolean()).isTrue();
        assertThat(assembly.path("browserUserRequest").asText()).isEqualTo(browser.userRequest());
        assertThat(assembly.path("browserCurrentPageUrl").asText()).isEqualTo(browser.currentPageUrl());
        assertThat(assembly.has("previousBrowserUserRequest")).isFalse();
        for (var message : messages.getAllValues().subList(1, 4)) {
            var restricted = mapper.readTree(message.getPayload()).path("consultToolAssembly");
            assertThat(restricted.path("managedWebAccount").asBoolean()).isTrue();
            assertThat(restricted.has("browserUserRequest")).isFalse();
            assertThat(restricted.has("previousBrowserUserRequest")).isFalse();
            assertThat(restricted.has("browserCurrentPageUrl")).isFalse();
        }
    }

    @Test
    void accountSelectionReceivesTheOriginalQuestionEvenWithoutBrowserIntent() throws Exception {
        var mapper = new ObjectMapper();
        var client = new SidecarClient(new ClaudeChatProperties(), new ClaudeChatWsProperties(), mapper);
        var connection = mock(WebSocketSession.class);
        when(connection.isOpen()).thenReturn(true);
        ReflectionTestUtils.setField(client, "session", connection);
        var provider = mock(AgentToolAssemblyProvider.class);
        String question = "菜单搜成本分析，核对上期单价";
        when(provider.resolve("consult", question, null)).thenReturn(Optional.of(new AgentToolAssemblyProvider.Assembly(
                List.of("consult_web"), List.of("consult-readonly"), "平台装配", null, true)));
        ReflectionTestUtils.setField(client, "toolAssemblyProviders", List.of(provider));
        String modelInput = "历史页面 https://other.example.test/\n" + question;
        client.userMessage("consult", modelInput, null, null, List.of(), "turn", null, null,
                List.of(), null, null, Map.of("segmentId", "segment"), false, null, null, question);

        verify(provider).resolve("consult", question, null);
        var message = org.mockito.ArgumentCaptor.forClass(TextMessage.class);
        verify(connection).sendMessage(message.capture());
        var payload = mapper.readTree(message.getValue().getPayload());
        assertThat(payload.path("text").asText()).isEqualTo(modelInput);
        var assembly = payload.path("consultToolAssembly");
        assertThat(assembly.path("managedWebAccount").asBoolean()).isTrue();
        assertThat(assembly.has("browserUserRequest")).isFalse();
        assertThat(assembly.has("browserCurrentPageUrl")).isFalse();
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
