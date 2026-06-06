package com.exceptioncoder.toolbox.workline.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 工作线新建 / 更新入参。
 */
public record WorklineUpsertRequest(
        @NotBlank @Size(max = 100) String name,
        @Size(max = 500) String description
) {}
