package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewFeedbackRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ReviewSpaceRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import java.nio.file.Path;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReviewSpaceServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void createsReviewWithCodexDefaultConfigurationInsteadOfSourceOptions() {
        ReviewSpaceRepository reviews = mock(ReviewSpaceRepository.class);
        ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
        ReviewThreadForkGateway forkGateway = mock(ReviewThreadForkGateway.class);
        ReviewSpaceService service = new ReviewSpaceService(reviews, sessions, forkGateway,
                mock(ReviewFeedbackRepository.class));
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
}
