package com.exceptioncoder.toolbox.docker.api.dto;

public record ComposeActionResponse(
        int exitCode,
        String stdout,
        String stderr,
        long durationMs
) {}
