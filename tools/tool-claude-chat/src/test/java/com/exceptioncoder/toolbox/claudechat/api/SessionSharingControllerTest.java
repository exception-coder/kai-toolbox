package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
import com.exceptioncoder.toolbox.claudechat.service.SessionSharingService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SessionSharingControllerTest {
    @Test
    void doesNotReturnHistoryIfAccessExpiresWhileLoadingIt() {
        var sharing = mock(SessionSharingService.class);
        var history = mock(SessionHistoryService.class);
        var session = ClaudeChatSession.builder().cwd("server-cwd").sdkSessionId("native").build();
        when(sharing.requireReader("one")).thenReturn(session)
                .thenThrow(new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND));
        when(history.readCursorMessages("server-cwd", "native", null, null, null, 40))
                .thenReturn(new MessagePage(List.of(ChatMessageView.user("u", "private", 1L)), null, false));
        assertThatThrownBy(() -> new SessionSharingController(sharing, history).messages("one", null))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }

    @Test
    void supportsLegacyIntegerPaginationWithoutAcceptingClientPaths() {
        var sharing = mock(SessionSharingService.class);
        var history = mock(SessionHistoryService.class);
        when(sharing.requireReader("one")).thenReturn(ClaudeChatSession.builder().cwd("server-cwd").sdkSessionId("native").build());
        when(history.readCursorMessages("server-cwd", "native", null, 40, null, 40))
                .thenReturn(new MessagePage(List.of(), 20, false));
        var controller = new SessionSharingController(sharing, history);
        assertThat(controller.messages("one", "before:40").nextCursor()).isEqualTo("before:20");
        assertThatThrownBy(() -> controller.messages("one", "before:-1"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }

    @Test
    void onlyReturnsTextAndOpaqueCursorNeverToolsPathsOrNativeIdentity() throws Exception {
        var sharing = mock(SessionSharingService.class);
        var history = mock(SessionHistoryService.class);
        var session = ClaudeChatSession.builder().id("one").cwd("private-path").sdkSessionId("native-id")
                .codexHome("private-account").authToken("secret-token").build();
        when(sharing.requireReader("one")).thenReturn(session);
        when(history.readCursorMessages("private-path", "native-id", "private-account", null, "cursor", 40))
                .thenReturn(new MessagePage(List.of(ChatMessageView.user("u", "hello", 1L),
                        ChatMessageView.tool("t", "Bash", "sensitive-input", "sensitive-output", false, 2L),
                        ChatMessageView.assistant("a", "reply", "fork-secret", 3L)), null, false, "older"));
        var result = new SessionSharingController(sharing, history).messages("one", "cursor");
        assertThat(result.items()).extracting(SessionSharingController.SharedMessage::kind).containsExactly("user", "assistant");
        assertThat(result.nextCursor()).isEqualTo("older");
        assertThat(new ObjectMapper().writeValueAsString(result)).doesNotContain("private-path", "native-id",
                "private-account", "secret-token", "sensitive-input", "sensitive-output", "fork-secret");
        when(sharing.requireReader("one")).thenThrow(new IllegalStateException("revoked"));
        assertThatThrownBy(() -> new SessionSharingController(sharing, history).messages("one", null)).hasMessage("revoked");
        verify(history, times(1)).readCursorMessages(any(), any(), any(), any(), any(), anyInt());
    }
}
