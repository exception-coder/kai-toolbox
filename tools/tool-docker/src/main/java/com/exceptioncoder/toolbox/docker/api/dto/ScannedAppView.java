package com.exceptioncoder.toolbox.docker.api.dto;

public record ScannedAppView(
        String baseDir,
        String composeFile,
        String name,
        boolean registered,
        String existingAppId
) {}
