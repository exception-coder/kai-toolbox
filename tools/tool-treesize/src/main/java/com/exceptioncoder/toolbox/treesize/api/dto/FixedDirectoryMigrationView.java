package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.service.FixedDirectoryMigrationService;

public record FixedDirectoryMigrationView(
        String migrationId,
        String recipeId,
        String displayName,
        String sourcePath,
        String targetPath,
        String backupPath,
        boolean available,
        boolean alreadyLinked,
        boolean junctionVerified,
        long estimatedBytes,
        long copiedFiles,
        long copiedBytes,
        String message
) {
    public static FixedDirectoryMigrationView from(FixedDirectoryMigrationService.Status status) {
        return new FixedDirectoryMigrationView(
                status.migrationId(),
                status.recipeId(),
                status.displayName(),
                status.sourcePath(),
                status.targetPath(),
                status.backupPath(),
                status.available(),
                status.alreadyLinked(),
                status.junctionVerified(),
                status.estimatedBytes(),
                status.copiedFiles(),
                status.copiedBytes(),
                status.message()
        );
    }
}
