package com.exceptioncoder.toolbox.ops.api.dto;

import jakarta.validation.constraints.NotBlank;

public record SqlQueryRequest(
        @NotBlank String sql,
        Integer maxRows
) {}
