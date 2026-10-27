package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.*;
import com.exceptioncoder.toolbox.claudechat.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultHistoryAuthorizationTest {
    private final SessionHistoryService nativeHistory = mock(SessionHistoryService.class);
    private final ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
    private final ConsultRuntimeRepository journal = mock(ConsultRuntimeRepository.class);
    private final ClaudeChatSessionAccessPolicy access = mock(ClaudeChatSessionAccessPolicy.class);
    private final ClaudeChatHistoryController controller = new ClaudeChatHistoryController(nativeHistory, mock(SessionAliasRepository.class), sessions, new ObjectMapper());
    private final ClaudeChatSession consultation = ClaudeChatSession.builder().id("s").userId(7L).sdkSessionId("new-B")
            .executionPolicy("consult-readonly").codexHome("B").build();

    @BeforeEach void setup() {
        ReflectionTestUtils.setField(controller, "consultHistory", journal);
        ReflectionTestUtils.setField(controller, "consultRuntime", mock(ConsultRuntimeCoordinator.class));
        ReflectionTestUtils.setField(controller, "accessPolicy", access);
    }

    @Test void oldAccountNativeIdCannotBypassOwnershipWithoutLogicalSessionParameter() {
        when(journal.sessionForNative("old-A")).thenReturn(Optional.of("s"));
        when(sessions.findById("s")).thenReturn(Optional.of(consultation));
        when(access.canAccessCurrentUser(consultation)).thenReturn(false);
        assertThatThrownBy(() -> controller.messages("old-A", null, null, 30, null, null, null)).hasMessageContaining("无权读取");
        verifyNoInteractions(nativeHistory);
        verify(journal, never()).messages(any(), any(), anyInt());
    }

    @Test void storedMessagesDoNotRequireOldAiLoginAndPreserveFileReferences() {
        when(sessions.findById("s")).thenReturn(Optional.of(consultation));
        when(access.canAccessCurrentUser(consultation)).thenReturn(true);
        when(journal.imported("s")).thenReturn(true);
        var page = new MessagePage(List.of(ChatMessageView.assistant("answer", "SQL及原文件 /original/report.xlsx", 1L)), null, false);
        when(journal.messages("s", null, 30)).thenReturn(page);
        assertThat(controller.messages("old-A", null, null, 30, "s", "cursor", null)).isEqualTo(page);
        verifyNoInteractions(nativeHistory);
    }
}
