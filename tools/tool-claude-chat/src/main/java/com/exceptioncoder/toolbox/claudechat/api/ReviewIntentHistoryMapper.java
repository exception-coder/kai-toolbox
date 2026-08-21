package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.domain.ReviewIntentAssessment;

import java.util.ArrayList;
import java.util.List;

/** 将运行期评审意图稳定装配到引擎历史消息。 */
final class ReviewIntentHistoryMapper {
    private static final long MAX_TIMESTAMP_DISTANCE_MILLIS = 30_000L;

    private ReviewIntentHistoryMapper() {
    }

    static List<ChatMessageView> attach(List<ChatMessageView> messages,
                                        List<ReviewIntentAssessment> assessments) {
        List<ReviewIntentAssessment> remaining = new ArrayList<>(assessments);
        List<ChatMessageView> mapped = new ArrayList<>(messages.size());
        for (ChatMessageView message : messages) {
            mapped.add(attach(message, remaining));
        }
        return List.copyOf(mapped);
    }

    private static ChatMessageView attach(ChatMessageView message,
                                          List<ReviewIntentAssessment> remaining) {
        if (!"user".equals(message.kind())) {
            return message;
        }
        ReviewIntentAssessment assessment = findExact(message, remaining);
        if (assessment == null) {
            assessment = findByTimestamp(message, remaining);
        }
        if (assessment == null) {
            return message;
        }
        remaining.remove(assessment);
        return message.withReviewIntent(toView(assessment));
    }

    private static ReviewIntentAssessment findExact(ChatMessageView message,
                                                     List<ReviewIntentAssessment> remaining) {
        if (message.turnId() == null) {
            return null;
        }
        return remaining.stream()
                .filter(value -> message.turnId().equals(value.turnId()))
                .findFirst()
                .orElse(null);
    }

    private static ReviewIntentAssessment findByTimestamp(ChatMessageView message,
                                                           List<ReviewIntentAssessment> remaining) {
        if (message.ts() == null) {
            return null;
        }
        return remaining.stream()
                .filter(value -> timestampDistance(message, value) <= MAX_TIMESTAMP_DISTANCE_MILLIS)
                .min((left, right) -> Long.compare(timestampDistance(message, left),
                        timestampDistance(message, right)))
                .orElse(null);
    }

    private static long timestampDistance(ChatMessageView message, ReviewIntentAssessment assessment) {
        return Math.abs(message.ts() - assessment.createdAt());
    }

    private static ChatMessageView.ReviewIntentView toView(ReviewIntentAssessment value) {
        return new ChatMessageView.ReviewIntentView(
                value.finalIntent(), value.classificationStatus(), value.confidence(), value.reason(),
                value.signals(), value.extractedTitle(), value.extractedContent(), value.clientMessageId());
    }
}
