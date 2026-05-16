package com.exceptioncoder.toolbox.treesize.domain;

/**
 * A {@link VideoFile} paired with its last-access timestamp from {@code treesize_video_recent}.
 * Returned by the "最近访问" endpoint; the {@code file} half also satisfies the existing
 * library-item rendering on the frontend so the same thumbnail + click handler can be reused.
 */
public record RecentVideoFile(VideoFile file, long lastAccessAt) {}
