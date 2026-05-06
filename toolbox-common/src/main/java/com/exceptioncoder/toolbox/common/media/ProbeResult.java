package com.exceptioncoder.toolbox.common.media;

/**
 * ffprobe-derived metadata, stored in {@link FfmpegProbe}'s LRU cache.
 *
 * <p>{@code container} holds the raw {@code format_name} (e.g. {@code mov,mp4,m4a,3gp,3g2,mj2});
 * native-playable judgement does the comma-split internally. {@code audioCodec == "(none)"} when
 * the file has no audio stream — keeping it as a sentinel string avoids null checks downstream.
 */
public record ProbeResult(double durationSeconds, String container, String videoCodec, String audioCodec) {
    public static final ProbeResult UNKNOWN = new ProbeResult(0, "unknown", "unknown", "(none)");
}
