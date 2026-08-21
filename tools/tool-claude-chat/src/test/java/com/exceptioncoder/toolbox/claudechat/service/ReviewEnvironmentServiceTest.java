package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReviewEnvironmentServiceTest {

    @Test
    void reportsReadyWithoutExposingTechnicalConfiguration() {
        ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
        AttachmentStorageService attachments = mock(AttachmentStorageService.class);
        ClaudeChatSession session = ClaudeChatSession.builder()
                .id("review-1")
                .executionPolicy(SessionExecutionPolicy.REVIEW_ONLY)
                .build();
        when(sessions.findById("review-1")).thenReturn(Optional.of(session));
        when(attachments.capability("review-1"))
                .thenReturn(new AttachmentStorageService.Capability(true, "附件可以安全上传和读取"));

        var result = new ReviewEnvironmentService(sessions, attachments).assess("review-1");

        assertThat(result.status()).isEqualTo("READY");
        assertThat(result.checks()).extracting(ReviewEnvironmentService.Check::key)
                .containsExactly("link", "readonly", "attachments", "imageInput");
        assertThat(result.toString()).doesNotContain("model", "codex", "cwd", "tool");
    }

    @Test
    void reportsDegradedWhenReadonlyBoundaryIsMissing() {
        ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
        AttachmentStorageService attachments = mock(AttachmentStorageService.class);
        ClaudeChatSession session = ClaudeChatSession.builder()
                .id("review-1")
                .executionPolicy(SessionExecutionPolicy.STANDARD)
                .build();
        when(sessions.findById("review-1")).thenReturn(Optional.of(session));
        when(attachments.capability("review-1"))
                .thenReturn(new AttachmentStorageService.Capability(true, "附件可以安全上传和读取"));

        var result = new ReviewEnvironmentService(sessions, attachments).assess("review-1");

        assertThat(result.status()).isEqualTo("DEGRADED");
        assertThat(result.checks()).filteredOn(check -> "readonly".equals(check.key()))
                .extracting(ReviewEnvironmentService.Check::status)
                .containsExactly("FAIL");
    }
}
