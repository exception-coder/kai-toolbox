package com.exceptioncoder.toolbox.aisecretary.domain;

/**
 * 一条长期记忆（画像级）。{@code key} 是归一化键，用于同类去重/归并。
 */
public record Memory(
        String id,
        MemoryCategory category,
        String key,
        String value,
        String detail,
        String sourceNoteId,
        double confidence,
        MemoryStatus status,
        boolean pinned,
        long createdAt,
        long updatedAt) {
}
