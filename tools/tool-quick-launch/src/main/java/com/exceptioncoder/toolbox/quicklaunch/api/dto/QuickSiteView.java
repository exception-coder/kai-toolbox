package com.exceptioncoder.toolbox.quicklaunch.api.dto;

import com.exceptioncoder.toolbox.quicklaunch.domain.OpenMode;
import com.exceptioncoder.toolbox.quicklaunch.domain.QuickSite;
import com.exceptioncoder.toolbox.quicklaunch.domain.WindowBehavior;

public record QuickSiteView(
        String id,
        String title,
        String siteUrl,
        String groupName,
        String icon,
        OpenMode openMode,
        WindowBehavior windowBehavior,
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
    public static QuickSiteView from(QuickSite site) {
        return new QuickSiteView(
                site.id(), site.title(), site.siteUrl(), site.groupName(), site.icon(), site.openMode(), site.windowBehavior(),
                site.windowWidth(), site.windowHeight(), site.sortOrder(), site.pinned(), site.enabled(),
                site.openCount(), site.lastOpenedAt(), site.createdAt(), site.updatedAt());
    }
}
