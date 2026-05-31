package com.exceptioncoder.toolbox.docker.api.dto;

import com.exceptioncoder.toolbox.docker.domain.DockerApp;

public record DockerAppView(
        String id,
        String hostId,
        String name,
        String baseDir,
        String composeFile,
        String note,
        long createdAt,
        long updatedAt
) {
    public static DockerAppView from(DockerApp a) {
        return new DockerAppView(
                a.getId(), a.getHostId(), a.getName(), a.getBaseDir(),
                a.getComposeFile(), a.getNote(),
                a.getCreatedAt(), a.getUpdatedAt());
    }
}
