package com.exceptioncoder.toolbox.treesize.domain;

/**
 * A file row from {@code treesize_node} joined with its scan's root path, used by the video
 * library. {@code favorited} is the LEFT-JOIN result against {@code treesize_video_favorite}
 * and is meaningful only on rows produced by the library query — internal callers (e.g. the
 * thumbnail warmer, junk cleaner) pass {@code false} since they don't surface this flag.
 */
public record VideoFile(String scanId, String rootPath, String path, String name, long size,
                        boolean favorited) {}
