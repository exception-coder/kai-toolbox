package com.exceptioncoder.toolbox.browserrequest.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PullFeishuRequirementsRequest(
        @NotBlank @Size(max = 2048) String url,
        @NotBlank @Size(max = 32768) String cookie,
        @Size(max = 4096) String recordsUrl
) {}
