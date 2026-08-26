package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssistantConversationBindingServiceTest {
    @Mock
    private ClaudeChatSessionRepository sessions;

    @Test
    void returnsTheExistingConversationForTheSameUserSystemAndPage() {
        ClaudeChatSession existing = conversation("existing");
        ClaudeChatSession candidate = conversation("candidate");
        when(sessions.findAssistantConversation(7L, "SCM", "https://scm.example/progress"))
                .thenReturn(Optional.of(existing));
        AssistantConversationBindingService service = new AssistantConversationBindingService(sessions);

        var result = service.resolveOrCreate(candidate);

        assertThat(result.created()).isFalse();
        assertThat(result.session()).isSameAs(existing);
    }

    @Test
    void resolvesTheWinnerWhenTwoTabsCreateTheSameBindingConcurrently() {
        ClaudeChatSession winner = conversation("winner");
        ClaudeChatSession candidate = conversation("candidate");
        when(sessions.findAssistantConversation(7L, "SCM", "https://scm.example/progress"))
                .thenReturn(Optional.empty(), Optional.of(winner));
        doThrow(new DataIntegrityViolationException("unique binding"))
                .when(sessions).insert(candidate);
        AssistantConversationBindingService service = new AssistantConversationBindingService(sessions);

        var result = service.resolveOrCreate(candidate);

        assertThat(result.created()).isFalse();
        assertThat(result.session()).isSameAs(winner);
        verify(sessions).insert(candidate);
    }

    private ClaudeChatSession conversation(String id) {
        return ClaudeChatSession.builder()
                .id(id)
                .userId(7L)
                .assistantAppId("SCM")
                .assistantPageKey("https://scm.example/progress")
                .assistantPageUrl("https://scm.example/progress")
                .build();
    }
}
