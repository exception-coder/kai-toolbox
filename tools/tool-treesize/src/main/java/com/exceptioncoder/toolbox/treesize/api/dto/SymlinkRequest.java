package com.exceptioncoder.toolbox.treesize.api.dto;

import jakarta.validation.constraints.NotBlank;

public record SymlinkRequest(
        @NotBlank String sourcePath,
        @NotBlank String targetPath,
        /** Optional client-generated task ID. When supplied, SSE progress events fire to {@code /symlink/events/{taskId}}. */
        String taskId
) {}
