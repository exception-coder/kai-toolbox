package com.exceptioncoder.toolbox.flatten.api.dto;

import com.exceptioncoder.toolbox.flatten.domain.FlattenFile;

public record FileItemView(
        String path,
        String name,
        long size,
        String hash,
        long modifiedAt
) {
    public static FileItemView from(FlattenFile f) {
        return new FileItemView(f.getPath(), f.getName(), f.getSize(), f.getHash(), f.getModifiedAt());
    }
}
