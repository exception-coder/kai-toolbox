package com.exceptioncoder.toolbox.magnet.api.dto;

import jakarta.validation.constraints.NotBlank;

public record AddUriRequest(
        @NotBlank(message = "uri 必填") String uri,
        String savePath
) {}
