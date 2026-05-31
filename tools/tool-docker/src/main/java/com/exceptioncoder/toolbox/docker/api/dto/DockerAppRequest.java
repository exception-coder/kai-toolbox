package com.exceptioncoder.toolbox.docker.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DockerAppRequest(
        @NotBlank @Size(max = 128) String name,
        @NotBlank @Size(max = 512) String baseDir,
        @Size(max = 128) String composeFile,
        @Size(max = 1024) String note,
        Boolean skipValidate
) {}
