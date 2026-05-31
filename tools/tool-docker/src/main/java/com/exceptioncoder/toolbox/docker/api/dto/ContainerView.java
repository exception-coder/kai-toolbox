package com.exceptioncoder.toolbox.docker.api.dto;

public record ContainerView(
        String id,
        String shortId,
        String name,
        String image,
        String state,
        String status,
        long createdAt,
        String ports,
        String composeProject,
        String composeService,
        String appId
) {}
