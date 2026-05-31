package com.exceptioncoder.toolbox.docker.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ScanRequest(
        @NotBlank @Size(max = 512) String baseDir,
        @Min(1) @Max(5) Integer maxDepth
) {}
