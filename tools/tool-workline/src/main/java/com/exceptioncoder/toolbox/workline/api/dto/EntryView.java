package com.exceptioncoder.toolbox.workline.api.dto;

import com.exceptioncoder.toolbox.workline.domain.WorklineEntry;

import java.util.List;

/**
 * 工作条目出参。{@code parentId} 为空表示顶层摘要条目；{@code children} 仅顶层条目填充其明细子条目。
 */
public record EntryView(
        long id,
        long lineId,
        Long parentId,
        String title,
        String coreContent,
        String achievement,
        int sortOrder,
        long createdAt,
        long updatedAt,
        List<EntryView> children
) {
    public static EntryView of(WorklineEntry e, List<EntryView> children) {
        return new EntryView(
                e.getId(), e.getLineId(), e.getParentId(), e.getTitle(), e.getCoreContent(),
                e.getAchievement(), e.getSortOrder(), e.getCreatedAt(), e.getUpdatedAt(),
                children == null ? List.of() : children);
    }

    public static EntryView of(WorklineEntry e) {
        return of(e, List.of());
    }
}
