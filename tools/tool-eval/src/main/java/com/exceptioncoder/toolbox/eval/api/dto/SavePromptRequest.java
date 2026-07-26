package com.exceptioncoder.toolbox.eval.api.dto;

import jakarta.validation.constraints.NotBlank;

/** 新增一个提示词版本。内容变更一律走新增，不提供原地修改入口。 */
public record SavePromptRequest(
        @NotBlank String promptKey,
        @NotBlank String content,
        String note,
        Boolean activate
) {
}
