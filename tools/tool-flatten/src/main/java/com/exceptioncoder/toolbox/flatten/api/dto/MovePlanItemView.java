package com.exceptioncoder.toolbox.flatten.api.dto;

import com.exceptioncoder.toolbox.flatten.domain.FlattenFile;

public record MovePlanItemView(
        String sourcePath,
        String sourceName,
        String targetName,
        long size,
        boolean conflict
) {
    public static MovePlanItemView from(FlattenFile f) {
        boolean conflict = f.getTargetName() != null && !f.getTargetName().equals(f.getName());
        return new MovePlanItemView(
                f.getPath(),
                f.getName(),
                f.getTargetName(),
                f.getSize(),
                conflict
        );
    }
}
