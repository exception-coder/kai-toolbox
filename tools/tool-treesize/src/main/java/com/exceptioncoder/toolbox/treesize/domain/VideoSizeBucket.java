package com.exceptioncoder.toolbox.treesize.domain;

/**
 * Coarse size buckets the video library exposes as a filter. Boundaries use 1024-based units
 * to match the frontend's {@code formatBytes} display, so the labels and the SQL filter agree.
 *
 * <p>{@link #minBytesInclusive} / {@link #maxBytesExclusive} are passed straight into a
 * {@code n.size >= ? AND n.size < ?} clause; {@link #ALL} uses {@code [0, Long.MAX_VALUE)}
 * so the same SQL shape applies regardless of selection.
 */
public enum VideoSizeBucket {
    ALL(0L, Long.MAX_VALUE),
    TINY(0L, 100L * 1024 * 1024),                    // < 100 MB
    SMALL(100L * 1024 * 1024, 500L * 1024 * 1024),   // 100 MB – 500 MB
    MEDIUM(500L * 1024 * 1024, 1024L * 1024 * 1024), // 500 MB – 1 GB
    LARGE(1024L * 1024 * 1024, 4L * 1024 * 1024 * 1024),       // 1 GB – 4 GB
    XLARGE(4L * 1024 * 1024 * 1024, 10L * 1024 * 1024 * 1024), // 4 GB – 10 GB
    HUGE(10L * 1024 * 1024 * 1024, Long.MAX_VALUE);            // > 10 GB

    private final long minBytesInclusive;
    private final long maxBytesExclusive;

    VideoSizeBucket(long minBytesInclusive, long maxBytesExclusive) {
        this.minBytesInclusive = minBytesInclusive;
        this.maxBytesExclusive = maxBytesExclusive;
    }

    public long minBytesInclusive() { return minBytesInclusive; }
    public long maxBytesExclusive() { return maxBytesExclusive; }

    /** Lenient parse: unknown / null falls back to {@link #ALL}. */
    public static VideoSizeBucket parse(String raw) {
        if (raw == null || raw.isBlank()) return ALL;
        try {
            return VideoSizeBucket.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return ALL;
        }
    }
}
