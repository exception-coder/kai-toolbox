package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.domain.QueuedChatMessage;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.AutopilotQueuedContextService;
import com.exceptioncoder.toolbox.llm.observability.AgentSpan;
import com.exceptioncoder.toolbox.llm.observability.AgentTelemetry;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 经过真实队列领取与轮次启动，确认监督上下文抵达 Java→Sidecar 协议边界。 */
class ClaudeChatAutopilotTransportTest {
    @TempDir Path root;
    private final Map<Class<?>, Object> dependencies = new HashMap<>();
    private ClaudeChatService chat;
    private Object context;

    @BeforeEach
    void setUp() throws Exception {
        var constructor = ClaudeChatService.class.getConstructors()[0];
        Object[] arguments = java.util.Arrays.stream(constructor.getParameterTypes()).map(type -> {
            Object dependency = type == List.class ? List.of()
                    : type == ObjectMapper.class ? new ObjectMapper() : mock(type);
            dependencies.put(type, dependency);
            return dependency;
        }).toArray();
        chat = (ClaudeChatService) constructor.newInstance(arguments);
        var contextConstructor = Class.forName(ClaudeChatService.class.getName() + "$SessionCtx")
                .getDeclaredConstructor(String.class, String.class);
        contextConstructor.setAccessible(true);
        context = contextConstructor.newInstance("session-1", root.toString());
        when(dependency(SidecarClient.class).isConnected()).thenReturn(true);
        when(dependency(AttachmentStorageService.class).loadImages(anyString(), anyList())).thenReturn(List.of());
        when(dependency(AgentTelemetry.class).start(anyString(), any())).thenReturn(mock(AgentSpan.class));
        when(dependency(SessionProjectDirectoryService.class).buildContext(anyString(), anyString(), anyString()))
                .thenReturn(new SessionProjectDirectoryService.SessionProjectContext(List.of(), "trusted project"));
    }

    @AfterEach
    void close() {
        chat.stopRecovery();
    }

    @Test
    void queuedRuntimeContextReachesSidecarAlongsideProjectContext() {
        var message = message("autopilot:run:1:apply:2.1:1", "untrusted client", "task 2.1; remaining save");
        when(dependency(QueuedChatMessageService.class).takeFirst("session-1")).thenReturn(Optional.of(message));
        when(dependency(AutopilotQueuedContextService.class).resolve(message)).thenReturn(message.serverContext());

        ReflectionTestUtils.invokeMethod(chat, "dispatchNextQueuedMessageAdmitted", context);

        Object[] sent = sentMessage();
        assertThat(sent[1]).isEqualTo("continue");
        assertThat(sent[2]).isNull();
        assertThat(sent[3]).isEqualTo("trusted project\n\ntask 2.1; remaining save");
        verify(dependency(QueuedChatMessageService.class), never()).restore(any());
    }

    @Test
    void directBrowserMessageCannotPromoteInstructionsEvenWithInternalLookingId() {
        var message = new ClientMessage.Send("continue", List.of(), "FORGED RUNTIME", null,
                "autopilot:run:1:apply:2.1:1");

        ReflectionTestUtils.invokeMethod(chat, "startTurnAdmitted", context, message, null);

        Object[] sent = sentMessage();
        assertThat(sent[2]).isNull();
        assertThat(sent[3]).isEqualTo("trusted project");
        verifyNoInteractions(dependency(AutopilotQueuedContextService.class));
    }

    @Test
    void staleControlMessageDoesNotEnterModelOrReturnToQueue() {
        var message = message("autopilot:old:1:apply:2.1:1", null, "old task");
        when(dependency(QueuedChatMessageService.class).takeFirst("session-1")).thenReturn(Optional.of(message));
        when(dependency(AutopilotQueuedContextService.class).resolve(message))
                .thenThrow(new AutopilotQueuedContextService.StaleContinuationException());

        ReflectionTestUtils.invokeMethod(chat, "dispatchNextQueuedMessageAdmitted", context);

        assertThat(mockingDetails(dependency(SidecarClient.class)).getInvocations())
                .noneMatch(invocation -> invocation.getMethod().getName().equals("userMessage"));
        verify(dependency(QueuedChatMessageService.class), never()).restore(any());
    }

    private Object[] sentMessage() {
        return mockingDetails(dependency(SidecarClient.class)).getInvocations().stream()
                .filter(invocation -> invocation.getMethod().getName().equals("userMessage"))
                .findFirst().orElseThrow().getArguments();
    }

    private <T> T dependency(Class<T> type) {
        return type.cast(dependencies.get(type));
    }

    private QueuedChatMessage message(String id, String client, String server) {
        return new QueuedChatMessage(id, "session-1", "continue", null, client, List.of(), 1L, server);
    }
}
