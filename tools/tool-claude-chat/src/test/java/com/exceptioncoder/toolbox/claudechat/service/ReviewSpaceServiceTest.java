package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewSpace;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewFeedbackRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewSpaceRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewSummaryCoverageRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import java.nio.file.Path;
import java.util.Optional;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;

class ReviewSpaceServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void createsReviewWithCodexDefaultConfigurationInsteadOfSourceOptions() {
        ReviewSpaceRepository reviews = mock(ReviewSpaceRepository.class);
        ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
        ReviewThreadForkGateway forkGateway = mock(ReviewThreadForkGateway.class);
        ReviewSpaceService service = new ReviewSpaceService(reviews, sessions, forkGateway,
                mock(ReviewFeedbackRepository.class), mock(ReviewSummaryCoverageRepository.class));
        ClaudeChatSession source = ClaudeChatSession.builder()
                .id("source").cwd(tempDir.toString()).title("需求")
                .engine("claude").selectedModel("source-model").codexReasoningEffort("ultra")
                .codexSpeed("fast").apiBaseUrl("https://gateway.example").authToken("secret")
                .status(SessionStatus.IDLE).build();
        when(sessions.findById("source")).thenReturn(Optional.of(source));

        String previousHome = System.getProperty("user.home");
        System.setProperty("user.home", tempDir.toString());
        try {
            service.create("source", new ReviewSpaceService.CreateCommand("SAFE_SNAPSHOT", null,
                    "需求快照", 7, null, "D:/auth/account-b"));
        } finally {
            System.setProperty("user.home", previousHome);
        }

        ArgumentCaptor<ClaudeChatSession> inserted = ArgumentCaptor.forClass(ClaudeChatSession.class);
        verify(sessions).insert(inserted.capture());
        ClaudeChatSession review = inserted.getValue();
        assertThat(review.getEngine()).isEqualTo("codex");
        assertThat(review.getSelectedModel()).isNull();
        assertThat(review.getCodexReasoningEffort()).isNull();
        assertThat(review.getCodexSpeed()).isEqualTo("default");
        assertThat(review.getCodexHome()).isEqualTo("D:/auth/account-b");
        assertThat(review.getApiBaseUrl()).isNull();
        assertThat(review.getAuthToken()).isNull();
        assertThat(review.getExecutionPolicy()).isEqualTo("review-only");
    }

    @Test
    void submitsSummaryAndCoverageAsOneApplicationOperation() {
        ReviewSpaceRepository reviews = mock(ReviewSpaceRepository.class);
        ReviewFeedbackRepository feedback = mock(ReviewFeedbackRepository.class);
        ReviewSummaryCoverageRepository coverage = mock(ReviewSummaryCoverageRepository.class);
        ReviewSpaceService service = new ReviewSpaceService(reviews, mock(ClaudeChatSessionRepository.class),
                mock(ReviewThreadForkGateway.class), feedback, coverage);
        ReviewSpace space = new ReviewSpace("space-1", "source-1", "review-1", "SAFE_SNAPSHOT",
                "hash", "ACTIVE", "评审", "", Long.MAX_VALUE, 1L, 1L);
        when(reviews.findByTokenHash(anyString())).thenReturn(Optional.of(space));
        when(feedback.insertOrFind(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var saved = service.submitFeedback("token", "增量结论", "final-summary-v1:test",
                List.of("assistant-content-v1:a", "assistant-content-v1:a"));

        verify(coverage).insertAll(eq("space-1"), eq(saved.id()),
                eq(List.of("assistant-content-v1:a")), anyLong());
    }

    @Test
    void rejectsInvalidCoverageBeforeWritingFeedback() {
        ReviewSpaceRepository reviews = mock(ReviewSpaceRepository.class);
        ReviewFeedbackRepository feedback = mock(ReviewFeedbackRepository.class);
        ReviewSummaryCoverageRepository coverage = mock(ReviewSummaryCoverageRepository.class);
        ReviewSpaceService service = new ReviewSpaceService(reviews, mock(ClaudeChatSessionRepository.class),
                mock(ReviewThreadForkGateway.class), feedback, coverage);
        ReviewSpace space = new ReviewSpace("space-1", "source-1", "review-1", "SAFE_SNAPSHOT",
                "hash", "ACTIVE", "评审", "", Long.MAX_VALUE, 1L, 1L);
        when(reviews.findByTokenHash(anyString())).thenReturn(Optional.of(space));

        assertThatThrownBy(() -> service.submitFeedback("token", "结论", "final-summary-v1:test",
                List.of("arbitrary-client-id")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("汇总覆盖消息标识不合法");
        verifyNoInteractions(feedback, coverage);
    }
}
