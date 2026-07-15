package com.exceptioncoder.toolbox.reqpool.api.dto;

import jakarta.validation.constraints.NotBlank;

public record LinkPrdRequest(@NotBlank String prdSessionId) {}
