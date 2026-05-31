package com.exceptioncoder.toolbox.docker.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record FileWriteRequest(
        @NotBlank @Size(max = 1024) String path,
        @NotBlank @Size(max = 262144) String content
) {}
