package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssistantConversationHistoryServiceTest {
    @Mock
    private ClaudeChatSessionRepository sessions;
    @Mock
    private SessionHistoryService history;

    @BeforeEach
    void authenticate() {
        AuthContext.set(new AuthPrincipal(7L, "tester", List.of("USER"), List.of(), "jti", Long.MAX_VALUE));
    }

    @AfterEach
    void clearAuthentication() {
        AuthContext.clear();
    }

    @Test
    void returnsOnlyUserAndAssistantMessagesFromTheRequestedPage() {
        ClaudeChatSession session = assistantConversation(7L);
        when(sessions.findById("session-1")).thenReturn(Optional.of(session));
        when(history.readMessages("D:/workspace", "sdk-1", "D:/codex", null, 30))
                .thenReturn(new MessagePage(List.of(
                        ChatMessageView.user("h1", "问题", 1L),
                        ChatMessageView.tool("h2", "query", null, "ok", false, 2L),
                        ChatMessageView.assistant("h3", "回答", 3L)), 1, false));
        AssistantConversationHistoryService service =
                new AssistantConversationHistoryService(sessions, history);

        var page = service.messages("session-1", null, null);

        assertThat(page.items()).extracting(AssistantConversationHistoryService.ConversationMessage::role)
                .containsExactly("user", "assistant");
        assertThat(page.nextBefore()).isEqualTo(1);
    }

    @Test
    void rejectsAConversationOwnedByAnotherUser() {
        when(sessions.findById("session-1")).thenReturn(Optional.of(assistantConversation(8L)));
        AssistantConversationHistoryService service =
                new AssistantConversationHistoryService(sessions, history);

        assertThatThrownBy(() -> service.messages("session-1", null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("403 FORBIDDEN");
    }

    private ClaudeChatSession assistantConversation(long userId) {
        return ClaudeChatSession.builder()
                .id("session-1")
                .userId(userId)
                .cwd("D:/workspace")
                .sdkSessionId("sdk-1")
                .codexHome("D:/codex")
                .executionPolicy(SessionExecutionPolicy.CONSULT_READONLY)
                .assistantAppId("SCM")
                .assistantPageKey("https://scm.example/progress")
                .build();
    }
}
