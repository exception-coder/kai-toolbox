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
import static org.mockito.Mockito.never;

class ReviewSpaceServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void createsReviewWithCodexDefaultConfigurationInsteadOfSourceOptions() {
        ReviewSpaceRepository reviews = mock(ReviewSpaceRepository.class);
        ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
        ReviewThreadForkGateway forkGateway = mock(ReviewThreadForkGateway.class);
        ReviewSpaceService service = new ReviewSpaceService(reviews, sessions, forkGateway,
                mock(ReviewFeedbackRepository.class), mock(ReviewSummaryCoverageRepository.class), cipher());
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
        ArgumentCaptor<ReviewSpace> stored = ArgumentCaptor.forClass(ReviewSpace.class);
        verify(reviews).insert(stored.capture());
        assertThat(stored.getValue().tokenCiphertext()).startsWith("v1.");
    }

    @Test
    void exposesOriginalSharePathInInternalRelationContext() {
        ReviewSpaceRepository reviews = mock(ReviewSpaceRepository.class);
        ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
        ReviewTokenCipher cipher = cipher();
        ReviewSpaceService service = new ReviewSpaceService(reviews, sessions,
                mock(ReviewThreadForkGateway.class), mock(ReviewFeedbackRepository.class),
                mock(ReviewSummaryCoverageRepository.class), cipher);
        ReviewSpace space = new ReviewSpace("space-1", "source-1", "review-1", "SAFE_SNAPSHOT",
                "hash", cipher.encrypt("original-token"), "ACTIVE", "评审", "", Long.MAX_VALUE, 1L, 1L);
        when(reviews.findByReviewSessionId("source-1")).thenReturn(Optional.empty());
        when(reviews.findBySourceSessionId("source-1")).thenReturn(List.of(space));
        when(sessions.findById("source-1")).thenReturn(Optional.of(ClaudeChatSession.builder()
                .id("source-1").cwd(tempDir.toString()).title("开发会话").build()));
        when(sessions.findById("review-1")).thenReturn(Optional.of(ClaudeChatSession.builder()
                .id("review-1").cwd(tempDir.toString()).title("评审会话").build()));

        ReviewSpaceService.RelationContext relation = service.relationContext("source-1");

        assertThat(relation.reviews()).singleElement()
                .extracting(ReviewSpaceService.ReviewLink::sharePath)
                .isEqualTo("/review/original-token");
    }

    @Test
    void backfillsRecoverableTokenWhenLegacyPublicLinkIsVisited() {
        ReviewSpaceRepository reviews = mock(ReviewSpaceRepository.class);
        ReviewTokenCipher cipher = cipher();
        ReviewSpaceService service = new ReviewSpaceService(reviews, mock(ClaudeChatSessionRepository.class),
                mock(ReviewThreadForkGateway.class), mock(ReviewFeedbackRepository.class),
                mock(ReviewSummaryCoverageRepository.class), cipher);
        ReviewSpace legacy = new ReviewSpace("space-1", "source-1", "review-1", "SAFE_SNAPSHOT",
                "legacy-hash", null, "ACTIVE", "评审", "", 1L, 1L, 1L);
        when(reviews.findByTokenHash(anyString())).thenReturn(Optional.of(legacy));

        assertThat(service.resolve("original-token")).isEmpty();

        ArgumentCaptor<String> ciphertext = ArgumentCaptor.forClass(String.class);
        verify(reviews).storeTokenCiphertext(eq("space-1"), anyString(), ciphertext.capture(), anyLong());
        assertThat(cipher.decrypt(ciphertext.getValue())).contains("original-token");
    }

    @Test
    void submitsSummaryAndCoverageAsOneApplicationOperation() {
        ReviewSpaceRepository reviews = mock(ReviewSpaceRepository.class);
        ReviewFeedbackRepository feedback = mock(ReviewFeedbackRepository.class);
        ReviewSummaryCoverageRepository coverage = mock(ReviewSummaryCoverageRepository.class);
        ReviewSpaceService service = new ReviewSpaceService(reviews, mock(ClaudeChatSessionRepository.class),
                mock(ReviewThreadForkGateway.class), feedback, coverage, cipher());
        ReviewSpace space = new ReviewSpace("space-1", "source-1", "review-1", "SAFE_SNAPSHOT",
                "hash", null, "ACTIVE", "评审", "", Long.MAX_VALUE, 1L, 1L);
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
                mock(ReviewThreadForkGateway.class), feedback, coverage, cipher());
        ReviewSpace space = new ReviewSpace("space-1", "source-1", "review-1", "SAFE_SNAPSHOT",
                "hash", null, "ACTIVE", "评审", "", Long.MAX_VALUE, 1L, 1L);
        when(reviews.findByTokenHash(anyString())).thenReturn(Optional.of(space));

        assertThatThrownBy(() -> service.submitFeedback("token", "结论", "final-summary-v1:test",
                List.of("arbitrary-client-id")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("汇总覆盖消息标识不合法");
        verifyNoInteractions(feedback, coverage);
    }

    @Test
    void keepsReviewRepliesBusinessFacing() {
        ReviewSpaceRepository reviews = mock(ReviewSpaceRepository.class);
        ReviewSpaceService service = new ReviewSpaceService(reviews, mock(ClaudeChatSessionRepository.class),
                mock(ReviewThreadForkGateway.class), mock(ReviewFeedbackRepository.class),
                mock(ReviewSummaryCoverageRepository.class), cipher());
        ReviewSpace space = new ReviewSpace("space-1", "source-1", "review-1", "SAFE_SNAPSHOT",
                "hash", null, "ACTIVE", "评审", "技术上下文", Long.MAX_VALUE, 1L, 1L);
        when(reviews.findByReviewSessionId("review-1")).thenReturn(Optional.of(space));

        String instructions = service.developerInstructions("review-1");

        assertThat(instructions)
                .contains("面向业务人员", "当前现状", "需求建议", "待确认项", "验收场景")
                .contains("不得在回复中输出源码文件、类名、接口、数据库表或字段、SQL")
                .doesNotContain("帮助业务、测试和开发人员");
    }

    @Test
    void reissuesExpiredActiveReviewAndRotatesToken() {
        ReviewSpaceRepository reviews = mock(ReviewSpaceRepository.class);
        ReviewSpaceService service = new ReviewSpaceService(reviews, mock(ClaudeChatSessionRepository.class),
                mock(ReviewThreadForkGateway.class), mock(ReviewFeedbackRepository.class),
                mock(ReviewSummaryCoverageRepository.class), cipher());
        ReviewSpace expired = new ReviewSpace("space-1", "source-1", "review-1", "SAFE_SNAPSHOT",
                "old-hash", null, "ACTIVE", "历史评审", "", 1L, 1L, 1L);
        when(reviews.findById("space-1")).thenReturn(Optional.of(expired));
        when(reviews.reissueToken(eq("space-1"), eq("old-hash"), anyString(), anyString(), anyLong(), anyLong()))
                .thenReturn(true);

        ReviewSpaceService.ReissuedReview result = service.reissue("space-1", 7);

        assertThat(result.token()).isNotBlank();
        assertThat(result.space().expiresAt()).isGreaterThan(System.currentTimeMillis());
        verify(reviews).reissueToken(eq("space-1"), eq("old-hash"), anyString(), anyString(),
                eq(result.space().expiresAt()), anyLong());
    }

    @Test
    void doesNotReissueRevokedReview() {
        ReviewSpaceRepository reviews = mock(ReviewSpaceRepository.class);
        ReviewSpaceService service = new ReviewSpaceService(reviews, mock(ClaudeChatSessionRepository.class),
                mock(ReviewThreadForkGateway.class), mock(ReviewFeedbackRepository.class),
                mock(ReviewSummaryCoverageRepository.class), cipher());
        ReviewSpace revoked = new ReviewSpace("space-1", "source-1", "review-1", "SAFE_SNAPSHOT",
                "old-hash", null, "REVOKED", "历史评审", "", 1L, 1L, 1L);
        when(reviews.findById("space-1")).thenReturn(Optional.of(revoked));

        assertThatThrownBy(() -> service.reissue("space-1", 7))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("已撤销的评审不能重新获取链接");
        verify(reviews, never()).reissueToken(anyString(), anyString(), anyString(), anyString(), anyLong(), anyLong());
    }

    private ReviewTokenCipher cipher() {
        return new ReviewTokenCipher("test-secret-for-review-links-at-least-32-bytes");
    }
}
