package com.exceptioncoder.toolbox.prdclarify.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * PRD 起草标题建议请求。
 *
 * @param project  系统或项目名称
 * @param module   业务模块名称
 * @param rawInput 需求描述及附件引用
 */
public record SuggestTitleRequest(
        @NotBlank @Size(max = 60) String project,
        @NotBlank @Size(max = 60) String module,
        @NotBlank @Size(max = 50_000) String rawInput
) {
}
