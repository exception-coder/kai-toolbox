package com.exceptioncoder.toolbox.treesize.api.dto;

import jakarta.validation.constraints.NotBlank;

public record FixedDirectoryMigrationRequest(@NotBlank String targetPath) {
}
