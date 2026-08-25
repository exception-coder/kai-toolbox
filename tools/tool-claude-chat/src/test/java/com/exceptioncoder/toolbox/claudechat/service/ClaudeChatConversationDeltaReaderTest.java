package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 会话增量读取顺序与水位测试。 */
class ClaudeChatConversationDeltaReaderTest {

    @Test
    void keepsTheOldestUnprocessedBatchAndContinuesFromItsWatermark() {
        ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
        SessionHistoryService history = mock(SessionHistoryService.class);
        ClaudeChatSession session = ClaudeChatSession.builder()
                .id("session-1")
                .cwd("D:/workspace")
                .sdkSessionId("sdk-1")
                .startedAt(1L)
                .build();
        when(sessions.findById("session-1")).thenReturn(Optional.of(session));
        List<ChatMessageView> messages = new ArrayList<>();
        for (int index = 1; index <= 105; index++) {
            messages.add(ChatMessageView.user("m" + index, "message-" + index, (long) index));
        }
        when(history.readMessages("D:/workspace", "sdk-1", null, null, Integer.MAX_VALUE))
                .thenReturn(new MessagePage(messages, null, false));
        ClaudeChatConversationDeltaReader reader =
                new ClaudeChatConversationDeltaReader(sessions, history, new ObjectMapper());

        ClaudeChatConversationDeltaReader.ConversationDelta first = reader.read("session-1", 0L);
        ClaudeChatConversationDeltaReader.ConversationDelta second =
                reader.read("session-1", first.toWatermark());

        assertThat(first.messages()).hasSize(100);
        assertThat(first.messages().getFirst().content()).isEqualTo("message-1");
        assertThat(first.messages().getLast().content()).isEqualTo("message-100");
        assertThat(first.caughtUp()).isFalse();
        assertThat(second.messages()).hasSize(5);
        assertThat(second.messages().getFirst().content()).isEqualTo("message-101");
        assertThat(second.caughtUp()).isTrue();
    }
}
