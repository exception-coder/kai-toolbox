package com.exceptioncoder.toolbox.workline.api.dto;

import com.exceptioncoder.toolbox.workline.domain.Workline;

/**
 * 工作线出参，附带该工作线下的条目数 {@code entryCount}。
 */
public record WorklineView(
        long id,
        String name,
        String description,
        int entryCount,
        int sortOrder,
        long createdAt,
        long updatedAt
) {
    public static WorklineView of(Workline w, int entryCount) {
        return new WorklineView(
                w.getId(), w.getName(), w.getDescription(),
                entryCount, w.getSortOrder(), w.getCreatedAt(), w.getUpdatedAt());
    }
}
