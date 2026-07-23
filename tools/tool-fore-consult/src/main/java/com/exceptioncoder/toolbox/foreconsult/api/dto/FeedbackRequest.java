package com.exceptioncoder.toolbox.foreconsult.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 单轮回答评分/反馈请求。
 *
 * @param rating        GOOD（满意）| BAD（不满意）
 * @param category      不满意类型（BAD 时，可选）
 * @param reason        不满意原因（BAD 时，可选）
 * @param correctAnswer 用户提供的正确答案（可选）
 */
public record FeedbackRequest(
        @NotBlank String rating,
        String category,
        String reason,
        String correctAnswer
) {
}
