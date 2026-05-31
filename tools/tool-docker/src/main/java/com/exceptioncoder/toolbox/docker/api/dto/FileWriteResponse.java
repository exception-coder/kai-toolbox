package com.exceptioncoder.toolbox.docker.api.dto;

public record FileWriteResponse(
        String path,
        String backupPath,
        long sizeBytes,
        long modifiedAt
) {}
