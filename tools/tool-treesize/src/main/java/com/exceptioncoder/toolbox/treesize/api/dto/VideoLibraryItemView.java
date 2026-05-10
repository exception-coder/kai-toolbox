package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.domain.VideoFile;

public record VideoLibraryItemView(String scanId, String rootPath, String path, String name, long size,
                                   boolean favorited) {
    public static VideoLibraryItemView from(VideoFile v) {
        return new VideoLibraryItemView(v.scanId(), v.rootPath(), v.path(), v.name(), v.size(), v.favorited());
    }
}
