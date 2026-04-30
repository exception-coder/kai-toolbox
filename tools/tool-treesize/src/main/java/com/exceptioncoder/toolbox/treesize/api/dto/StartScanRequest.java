package com.exceptioncoder.toolbox.treesize.api.dto;

import jakarta.validation.constraints.NotBlank;

public record StartScanRequest(
        @NotBlank String path
) {}
