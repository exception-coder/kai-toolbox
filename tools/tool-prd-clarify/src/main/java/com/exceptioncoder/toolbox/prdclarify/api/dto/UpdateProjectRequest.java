package com.exceptioncoder.toolbox.prdclarify.api.dto;

import jakarta.validation.constraints.Size;

/** 修改 PRD 所属分组（关联项目）；空值表示移到“未分类”。 */
public record UpdateProjectRequest(
        @Size(max = 500) String project
) {
}
