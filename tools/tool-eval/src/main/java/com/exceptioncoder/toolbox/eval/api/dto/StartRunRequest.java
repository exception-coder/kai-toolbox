package com.exceptioncoder.toolbox.eval.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 发起一次评测。
 *
 * @param promptVersion 指定提示词版本；为空取该 key 的 active 版本
 * @param model         指定模型；为空走引擎默认
 */
public record StartRunRequest(
        @NotBlank String adapter,
        @NotBlank String dataset,
        String model,
        Integer promptVersion,
        String note
) {
}
