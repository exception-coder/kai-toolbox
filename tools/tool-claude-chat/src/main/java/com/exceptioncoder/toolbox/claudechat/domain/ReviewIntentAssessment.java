package com.exceptioncoder.toolbox.claudechat.domain;

import java.util.List;

/** Forge 对单个评审轮次保存的结构化意图判定。 */
public record ReviewIntentAssessment(
        String reviewSpaceId,
        String reviewSessionId,
        String turnId,
        String clientMessageId,
        String preIntent,
        String finalIntent,
        String classificationStatus,
        double confidence,
        String reason,
        List<String> signals,
        String extractedTitle,
        String extractedContent,
        long createdAt,
        long updatedAt
) {
    public ReviewIntentAssessment {
        signals = signals == null ? List.of() : List.copyOf(signals);
    }
}
