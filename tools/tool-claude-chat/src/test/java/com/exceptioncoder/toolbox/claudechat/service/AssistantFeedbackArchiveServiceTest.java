package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCounts;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AssistantFeedbackArchiveServiceTest {
    private final ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
    private final AssistantFeedbackStorePort feedbackStore = mock(AssistantFeedbackStorePort.class);
    private final AttachmentStorageService attachments = mock(AttachmentStorageService.class);
    private final AssistantFeedbackArchiveService service =
            new AssistantFeedbackArchiveService(sessions, feedbackStore, attachments);

    @AfterEach
    void clearPrincipal() {
        AuthContext.clear();
    }

    @Test
    void listsOnlyCurrentUsersConsultSessionsWithThreeFeedbackCounts() {
        AuthContext.set(new AuthPrincipal(7L, "tester", List.of(), List.of(), "jti", Long.MAX_VALUE));
        ClaudeChatSession session = ClaudeChatSession.builder()
                .id("session-1").userId(7L).groupName("业务咨询")
                .title("新品进度咨询").lastSeenAt(2_000L).build();
        when(sessions.findConsultPage(7L, null, null, 21)).thenReturn(List.of(session));
        when(feedbackStore.summarizeCandidates(7L, List.of("session-1")))
                .thenReturn(Map.of("session-1", new FeedbackCounts(2, 3, 4)));

        AssistantFeedbackArchiveService.SessionPage page = service.listSessions(null, null, null);

        assertThat(page.items()).singleElement().satisfies(item -> {
            assertThat(item.title()).isEqualTo("新品进度咨询");
            assertThat(item.counts()).isEqualTo(new FeedbackCounts(2, 3, 4));
        });
        assertThat(page.nextCursor()).isNull();
    }

    @Test
    void scopesArchiveSummaryToRequestedSession() {
        AuthContext.set(new AuthPrincipal(7L, "tester", List.of(), List.of(), "jti", Long.MAX_VALUE));
        ClaudeChatSession session = ClaudeChatSession.builder()
                .id("session-1").userId(7L).groupName("业务咨询")
                .title("当前页面咨询").lastSeenAt(3_000L).build();
        when(sessions.findById("session-1")).thenReturn(java.util.Optional.of(session));
        when(feedbackStore.summarizeCandidates(7L, List.of("session-1")))
                .thenReturn(Map.of("session-1", new FeedbackCounts(3, 0, 0)));

        AssistantFeedbackArchiveService.SessionPage page = service.listSessions("session-1", null, null);

        assertThat(page.items()).singleElement().satisfies(item -> {
            assertThat(item.id()).isEqualTo("session-1");
            assertThat(item.counts()).isEqualTo(new FeedbackCounts(3, 0, 0));
        });
        assertThat(page.nextCursor()).isNull();
    }
}
