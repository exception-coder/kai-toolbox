package com.exceptioncoder.toolbox.treesize.api.dto;

import java.util.List;

/** Paginated response for {@code GET /api/treesize/videos}. */
public record VideoLibraryPageView(List<VideoLibraryItemView> items, long total, int offset, int limit) {}
