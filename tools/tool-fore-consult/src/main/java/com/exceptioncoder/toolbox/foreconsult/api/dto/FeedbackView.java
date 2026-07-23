package com.exceptioncoder.toolbox.foreconsult.api.dto;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultFeedback;

/**
 * 单轮回答评分/反馈的前端视图（只读）。
 *
 * @param turnIndex     第几轮问答
 * @param rating        GOOD | BAD
 * @param category      不满意类型
 * @param reason        不满意原因
 * @param correctAnswer 用户提供的正确答案
 */
public record FeedbackView(
        int turnIndex,
        String rating,
        String category,
        String reason,
        String correctAnswer
) {

    public static FeedbackView from(ConsultFeedback f) {
        return new FeedbackView(f.getTurnIndex(), f.getRating(), f.getCategory(), f.getReason(), f.getCorrectAnswer());
    }
}
