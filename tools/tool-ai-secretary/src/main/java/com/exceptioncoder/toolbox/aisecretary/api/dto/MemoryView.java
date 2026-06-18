package com.exceptioncoder.toolbox.aisecretary.api.dto;

import com.exceptioncoder.toolbox.aisecretary.domain.Memory;

/** 记忆的前端视图。 */
public record MemoryView(
        String id,
        String category,
        String categoryLabel,
        String key,
        String value,
        String detail,
        double confidence,
        String status,
        boolean pinned,
        long createdAt,
        long updatedAt) {

    public static MemoryView of(Memory m) {
        return new MemoryView(
                m.id(),
                m.category().name(),
                m.category().label(),
                m.key(),
                m.value(),
                m.detail(),
                m.confidence(),
                m.status().name(),
                m.pinned(),
                m.createdAt(),
                m.updatedAt());
    }
}
