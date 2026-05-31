package com.exceptioncoder.toolbox.docker.api.dto;

public record ComposeActionRequest(
        Boolean detach,
        Boolean removeOrphans,
        String pullPolicy
) {}
