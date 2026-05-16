package com.exceptioncoder.toolbox.treesize.domain;

/**
 * One sample of a single HLS segment transcode/copy. Collected on the playback hot path and
 * retained in a small in-memory ring buffer for diagnostics — never persisted.
 *
 * @param idx           segment index in the on-demand HLS playlist
 * @param fileName      source file name only (no parent path; stats are user-facing)
 * @param mode          {@code "copy"} when both video and audio can be remuxed, otherwise {@code "transcode"}
 * @param spawnMs       wall-clock from method entry to ffmpeg process spawned ({@code -1} when spawn failed)
 * @param firstByteMs   wall-clock from method entry to ffmpeg's first byte on stdout ({@code -1} when no byte was written)
 * @param totalMs       wall-clock from method entry to method exit (covers reap + drain)
 * @param bytesOut      bytes streamed to the HTTP response
 * @param aborted       {@code true} when the client closed the connection mid-stream
 * @param atEpochMs     System.currentTimeMillis() captured at method exit, for ordering on the wire
 */
public record SegmentStat(
        int idx,
        String fileName,
        String mode,
        long spawnMs,
        long firstByteMs,
        long totalMs,
        long bytesOut,
        boolean aborted,
        long atEpochMs
) {}
