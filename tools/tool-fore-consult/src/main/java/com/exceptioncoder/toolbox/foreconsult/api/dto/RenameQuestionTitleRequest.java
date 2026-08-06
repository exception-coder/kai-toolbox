package com.exceptioncoder.toolbox.foreconsult.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 重命名历史咨询标题的请求。
 *
 * @param title 用户填写的标题正文，不包含日期前缀
 */
public record RenameQuestionTitleRequest(
        @NotBlank @Size(max = 33) String title
) {
}
