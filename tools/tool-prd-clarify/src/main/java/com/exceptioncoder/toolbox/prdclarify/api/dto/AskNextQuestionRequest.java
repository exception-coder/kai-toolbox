package com.exceptioncoder.toolbox.prdclarify.api.dto;

import java.util.List;

/**
 * 请求 Claude 提出下一个澄清问题的参数。
 *
 * @param questionIndex 当前是第几轮（0-based），用于 prompt 中提示剩余次数
 * @param history       已完成的问答历史（按时间顺序）
 */
public record AskNextQuestionRequest(
        int questionIndex,
        List<QaPairRequest> history
) {}
