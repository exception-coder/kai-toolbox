package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewIntentAssessment;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ReviewIntentHistoryMapperTest {

    @Test
    void attachesIntentByTimestampWhenEngineTurnIdDiffers() {
        ChatMessageView user = ChatMessageView.user("history-1", "隐藏工具调用", 10_020L, "engine-turn");
        ReviewIntentAssessment assessment = assessment("runtime-turn", "client-message", 10_000L);

        ChatMessageView mapped = ReviewIntentHistoryMapper.attach(List.of(user), List.of(assessment)).getFirst();

        assertThat(mapped.reviewIntent()).isNotNull();
        assertThat(mapped.reviewIntent().intent()).isEqualTo("REQUIREMENT");
        assertThat(mapped.reviewIntent().sourceMessageId()).isEqualTo("client-message");
    }

    @Test
    void doesNotAttachStaleIntentToUnrelatedHistoryMessage() {
        ChatMessageView oldUser = ChatMessageView.user("history-old", "旧消息", 10_000L, "old-engine-turn");
        ReviewIntentAssessment recent = assessment("runtime-turn", "client-message", 100_000L);

        ChatMessageView mapped = ReviewIntentHistoryMapper.attach(List.of(oldUser), List.of(recent)).getFirst();

        assertThat(mapped.reviewIntent()).isNull();
    }

    private ReviewIntentAssessment assessment(String turnId, String clientMessageId, long createdAt) {
        return new ReviewIntentAssessment(
                "space", "session", turnId, clientMessageId, "REQUIREMENT", "REQUIREMENT",
                "CONFIRMED", 0.98, "明确要求页面变化", List.of("不要显示"),
                null, null, createdAt, createdAt);
    }
}
