package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.domain.RecentVideoFile;

public record RecentVideoFileView(VideoLibraryItemView item, long lastAccessAt) {
    public static RecentVideoFileView from(RecentVideoFile r) {
        return new RecentVideoFileView(VideoLibraryItemView.from(r.file()), r.lastAccessAt());
    }
}
