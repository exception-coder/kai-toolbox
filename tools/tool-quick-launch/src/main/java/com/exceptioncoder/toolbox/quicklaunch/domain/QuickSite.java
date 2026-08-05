package com.exceptioncoder.toolbox.quicklaunch.domain;

public record QuickSite(
        String id,
        String title,
        String siteUrl,
        String groupName,
        String icon,
        OpenMode openMode,
        int windowWidth,
        int windowHeight,
        int sortOrder,
        boolean pinned,
        boolean enabled,
        long openCount,
        Long lastOpenedAt,
        long createdAt,
        long updatedAt
) {
}
