package com.exceptioncoder.toolbox.flatten.api.dto;

import jakarta.validation.constraints.NotBlank;

public record StartScanRequest(
        @NotBlank String sourcePath,
        @NotBlank String targetPath
) {}
