package com.exceptioncoder.toolbox.foreconsult.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 单轮问答的 BUG 抽取台账：对应 consult_turn_extraction 表的一行。
 * 身份是 (sessionId, turnIndex)——consult_turn 会被整表重写，turnId 不是稳定标识。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConsultTurnExtraction {

    private String sessionId;
    private int turnIndex;
    private String answerHash;
    private String status;
    private Boolean isBug;
    private String bugId;
    private Integer promptVersion;
    private String raw;
    private String error;
    private long extractedAt;
}
