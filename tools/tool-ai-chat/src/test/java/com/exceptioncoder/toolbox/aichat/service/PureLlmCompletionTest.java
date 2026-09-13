package com.exceptioncoder.toolbox.aichat.service;

import com.exceptioncoder.toolbox.aichat.api.dto.SendMessageRequest;
import com.exceptioncoder.toolbox.aichat.config.AiChatProperties;
import com.exceptioncoder.toolbox.aichat.domain.ChatMessage;
import com.exceptioncoder.toolbox.aichat.domain.Conversation;
import com.exceptioncoder.toolbox.aichat.domain.MessageStatus;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.llm.config.LlmGatewayProperties;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.openai.OpenAiStreamingChatModel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PureLlmCompletionTest {
    private final ConversationService conversations = mock(ConversationService.class);
    private final ChatModelFactory factory = mock(ChatModelFactory.class);
    private final ModelCatalogService catalog = mock(ModelCatalogService.class);
    private final SseEmitterRegistry sse = mock(SseEmitterRegistry.class);
    private final OpenAiStreamingChatModel model = mock(OpenAiStreamingChatModel.class);
    private AiChatService service;

    @BeforeEach
    void setup() {
        service = new AiChatService(new AiChatProperties(), new LlmGatewayProperties(), conversations,
                factory, catalog, mock(AttachmentStorageService.class), sse);
        when(conversations.require("conversation")).thenReturn(Conversation.builder().id("conversation")
                .model("model").temperature(0.7).build());
        when(conversations.recentHistory(anyString(), anyInt())).thenReturn(List.of());
        when(catalog.isAllowed("model")).thenReturn(true);
        when(factory.sharedModel()).thenReturn(model);
        when(conversations.appendAssistantMessage(anyString(), anyString(), any(), any(), any()))
                .thenReturn(ChatMessage.builder().id("answer").build());
    }

    @Test
    void rejectsWrongModeBeforeSavingOrCallingModel() {
        for (String mode : List.of("CODE_AGENT", "unknown", "")) {
            var error = assertThrows(ResponseStatusException.class, () -> service.send(request(mode)));
            assertEquals(400, error.getStatusCode().value());
        }
        verifyNoInteractions(conversations, factory, model);
    }

    @Test
    void streamsWithoutToolsAndPreservesCompletion() {
        String task = service.send(request("LLM"));
        service.openStream(task);
        var handler = handler();
        handler.onPartialResponse("hello");
        handler.onCompleteResponse(ChatResponse.builder().aiMessage(AiMessage.from("hello")).build());
        verify(conversations).appendAssistantMessage(eq("conversation"), eq("model"), eq("hello"), eq(MessageStatus.DONE), any());
        assertFalse(service.stop(task));
    }

    @Test
    void rejectsUnsolicitedToolsInsteadOfStartingAnotherRound() {
        String task = service.send(request(null));
        service.openStream(task);
        handler().onCompleteResponse(ChatResponse.builder().aiMessage(AiMessage.from(ToolExecutionRequest.builder()
                .id("tool").name("shell").arguments("{}").build())).build());
        verify(conversations).appendAssistantMessage(eq("conversation"), eq("model"), any(), eq(MessageStatus.ERROR), any());
        verify(model, times(1)).chat(any(ChatRequest.class), any(StreamingChatResponseHandler.class));
        verify(sse).publish(eq(task), eq("error"), any());
    }

    @Test
    void stopPreservesPartialOutputAndIsIdempotent() {
        String task = service.send(request("LLM"));
        service.openStream(task);
        handler().onPartialResponse("partial");
        assertTrue(service.stop(task));
        assertFalse(service.stop(task));
        verify(conversations).appendAssistantMessage(eq("conversation"), eq("model"), eq("partial"), eq(MessageStatus.INTERRUPTED), any());
    }

    private StreamingChatResponseHandler handler() {
        var request = ArgumentCaptor.forClass(ChatRequest.class);
        var handler = ArgumentCaptor.forClass(StreamingChatResponseHandler.class);
        verify(model, timeout(2000)).chat(request.capture(), handler.capture());
        assertTrue(request.getValue().toolSpecifications() == null || request.getValue().toolSpecifications().isEmpty());
        return handler.getValue();
    }

    private SendMessageRequest request(String mode) {
        return new SendMessageRequest("conversation", "hello", List.of(), "model", 0.7, null, mode);
    }
}
