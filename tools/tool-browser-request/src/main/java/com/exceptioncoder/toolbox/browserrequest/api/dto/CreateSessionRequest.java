package com.exceptioncoder.toolbox.browserrequest.api.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateSessionRequest(String name, @NotBlank String url) {}
