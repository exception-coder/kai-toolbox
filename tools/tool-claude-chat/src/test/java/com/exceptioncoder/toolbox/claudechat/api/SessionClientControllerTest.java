package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.config.SessionClientProperties;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientPrincipal;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionDelegationRepository;
import com.exceptioncoder.toolbox.claudechat.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.claudechat.service.SessionAutopilotService;
import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionDelegationService;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionClientControllerTest {

    @Test
    void clampsHistoryLimitAndProjectsOnlyUserAssistantMessages() {
        SessionDelegationService delegations = mock(SessionDelegationService.class);
        SessionDelegationRepository grants = mock(SessionDelegationRepository.class);
        ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
        SessionHistoryService history = mock(SessionHistoryService.class);
        SessionClientPrincipal principal = new SessionClientPrincipal(20L, "grant-1", "session-1",
                "token-1", Instant.now().plusSeconds(60));
        ClaudeChatSession session = ClaudeChatSession.builder().id("session-1").cwd("D:/repo")
                .sdkSessionId("sdk-1").codexHome("D:/codex").build();
        when(delegations.authenticate(eq("access-token"), any())).thenReturn(principal);
        when(sessions.findById("session-1")).thenReturn(Optional.of(session));
        when(history.readMessages("D:/repo", "sdk-1", "D:/codex", null, 100)).thenReturn(new MessagePage(
                List.of(message("u1", "user"), message("t1", "tool"), message("a1", "assistant")), null, false));
        SessionClientController controller = new SessionClientController(delegations, grants, sessions, history,
                mock(AttachmentStorageService.class), mock(SessionAutopilotService.class),
                new SessionClientProperties());

        SessionClientController.PublicMessagePage page = controller.messages("Bearer access-token", null, 500);

        assertThat(page.items()).extracting(SessionClientController.PublicMessageView::role)
                .containsExactly("user", "assistant");
        verify(history).readMessages("D:/repo", "sdk-1", "D:/codex", null, 100);
    }

    private ChatMessageView message(String id, String kind) {
        return switch (kind) {
            case "user" -> ChatMessageView.user(id, "text", 1L);
            case "assistant" -> ChatMessageView.assistant(id, "text", 1L);
            default -> ChatMessageView.tool(id, "Read", null, "output", false, 1L);
        };
    }
}
