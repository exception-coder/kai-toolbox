package com.exceptioncoder.toolbox.ops.api.dto;

import com.exceptioncoder.toolbox.ops.domain.OpsSystem;

public record SystemView(
        String id,
        String name,
        String code,
        String owner,
        String description,
        int sortOrder,
        long createdAt,
        long updatedAt
) {
    public static SystemView from(OpsSystem s) {
        return new SystemView(
                s.getId(), s.getName(), s.getCode(), s.getOwner(), s.getDescription(),
                s.getSortOrder(), s.getCreatedAt(), s.getUpdatedAt());
    }
}
