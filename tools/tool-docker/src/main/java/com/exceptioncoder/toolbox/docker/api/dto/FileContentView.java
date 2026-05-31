package com.exceptioncoder.toolbox.docker.api.dto;

public record FileContentView(
        String path,
        String content,
        long sizeBytes,
        long modifiedAt
) {}
