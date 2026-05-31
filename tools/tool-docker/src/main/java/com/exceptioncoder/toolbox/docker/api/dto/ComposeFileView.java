package com.exceptioncoder.toolbox.docker.api.dto;

public record ComposeFileView(
        String path,
        String name,
        long sizeBytes,
        long modifiedAt
) {}
