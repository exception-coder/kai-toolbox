package com.exceptioncoder.toolbox.prdclarify.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 重命名会话标题的请求体。
 *
 * @param title 新标题（非空，长度上限与创建时一致）
 */
public record UpdateTitleRequest(
        @NotBlank @Size(max = 200) String title
) {
}
