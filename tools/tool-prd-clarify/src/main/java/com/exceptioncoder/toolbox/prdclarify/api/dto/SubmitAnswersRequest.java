package com.exceptioncoder.toolbox.prdclarify.api.dto;

import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * 提交用户对澄清问题的回答。
 *
 * @param answers 按问题顺序（0-based）排列的答案列表
 */
public record SubmitAnswersRequest(
        @NotNull List<String> answers
) {
}
