package com.exceptioncoder.toolbox.treesize.api.dto;

import java.util.List;

/**
 * Summary of {@code DELETE /api/treesize/videos/junk} — how many AppleDouble-style cache
 * files were nuked, how many were skipped (e.g. grew past the size threshold or already
 * gone), and the per-path errors that occurred (capped to a few; full detail is in logs).
 */
public record CleanJunkResultView(int deleted, int skipped, List<String> errors) {}
