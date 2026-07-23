package com.exceptioncoder.toolbox.foreconsult.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 单轮回答的用户评分/反馈：对应 consult_feedback 表的一行。
 * 独立于 consult_turn（后者会随增量同步整表重写），按 (sessionId,turnIndex) 唯一。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConsultFeedback {

    private String sessionId;
    private int turnIndex;
    /** GOOD（满意）| BAD（不满意）。 */
    private String rating;
    /** 不满意类型（BAD 时），如 答非所问 / 信息有误 / 不够具体 / 入口步骤不对 / 其他。 */
    private String category;
    private String reason;
    /** 用户提供的正确答案（可选）。 */
    private String correctAnswer;
    private long createdAt;
    private long updatedAt;
}
