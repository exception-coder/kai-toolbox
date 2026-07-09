package com.exceptioncoder.toolbox.ops.api.dto;

import jakarta.validation.constraints.NotBlank;

public record RedisExecRequest(@NotBlank String command) {}
