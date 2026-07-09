package com.exceptioncoder.toolbox.ops.api.dto;

import jakarta.validation.constraints.NotBlank;

public record SystemRequest(
        @NotBlank String name,
        String code,
        String owner,
        String description,
        Integer sortOrder
) {}
