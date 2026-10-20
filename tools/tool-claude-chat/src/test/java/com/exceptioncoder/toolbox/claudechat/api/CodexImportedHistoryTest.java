package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAliasRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class CodexImportedHistoryTest {
    @Test void logicalSessionChoosesHomeEvenWhenNativeIdsAreEqual() {
        var repo = mock(ClaudeChatSessionRepository.class);
        var history = mock(SessionHistoryService.class);
        var policy = mock(ClaudeChatSessionAccessPolicy.class);
        var controller = new ClaudeChatHistoryController(history, mock(SessionAliasRepository.class), repo, new ObjectMapper());
        ReflectionTestUtils.setField(controller, "accessPolicy", policy);
        var a = ClaudeChatSession.builder().id("forge-a").sdkSessionId("shared").cwd("D:/a").codexHome("home-a").build();
        var b = ClaudeChatSession.builder().id("forge-b").sdkSessionId("shared").cwd("D:/b").codexHome("home-b").build();
        when(repo.findById("forge-a")).thenReturn(Optional.of(a));
        when(repo.findById("forge-b")).thenReturn(Optional.of(b));
        when(policy.canAccessCurrentUser(a)).thenReturn(true);
        when(policy.canAccessCurrentUser(b)).thenReturn(true);
        controller.messages("shared", "untrusted", null, 30, "forge-a", null, null);
        controller.messages("shared", "untrusted", null, 30, "forge-b", null, null);
        verify(history).readMessages("D:/a", "shared", "home-a", null, 30);
        verify(history).readMessages("D:/b", "shared", "home-b", null, 30);
        controller.messages("shared", "untrusted", null, 30, "forge-a", "cursor", "opaque");
        verify(history).readCursorMessages("D:/a", "shared", "home-a", null, "opaque", 30);
        verify(repo, never()).findBySdkSessionId(anyString());
        assertThatThrownBy(() -> controller.messages("wrong-handle", null, null, 30, "forge-a", null, null))
                .hasMessageContaining("句柄不属于当前会话");
        when(policy.canAccessCurrentUser(a)).thenReturn(false);
        assertThatThrownBy(() -> controller.messages("shared", null, null, 30, "forge-a", "cursor", null))
                .hasMessageContaining("无权读取");
        verifyNoMoreInteractions(history);
    }

    @Test void reviewHistoryNeverAcceptsAnUnrestrictedByteCursor() {
        var repo = mock(ClaudeChatSessionRepository.class);
        var history = mock(SessionHistoryService.class);
        var policy = mock(ClaudeChatSessionAccessPolicy.class);
        var controller = new ClaudeChatHistoryController(history, mock(SessionAliasRepository.class), repo, new ObjectMapper());
        ReflectionTestUtils.setField(controller, "accessPolicy", policy);
        var session = ClaudeChatSession.builder().id("review").sdkSessionId("native").cwd("D:/review")
                .codexHome("home").executionPolicy("review-only").build();
        when(repo.findById("review")).thenReturn(Optional.of(session));
        when(policy.canAccessCurrentUser(session)).thenReturn(true);
        assertThatThrownBy(() -> controller.messages("native", null, null, 30, "review", "cursor", "opaque"))
                .hasMessageContaining("评审历史");
        verifyNoInteractions(history);
        controller.messages("native", null, null, 30, "review", "cursor", null);
        verify(history).readReviewMessages("D:/review", "native", "home", null, 30);
    }
}
