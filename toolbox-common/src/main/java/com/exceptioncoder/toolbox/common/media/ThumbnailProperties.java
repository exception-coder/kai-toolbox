package com.exceptioncoder.toolbox.common.media;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code toolbox.thumbnail.*} from application.yml.
 * Cache directory defaults under {@code toolbox.data-dir/cache/thumbs} via SpEL in the yaml.
 */
@ConfigurationProperties(prefix = "toolbox.thumbnail")
public class ThumbnailProperties {
    /** Absolute path of the on-disk thumbnail cache. */
    private String cacheDir = "";
    /**
     * Hard cap on concurrent ffmpeg thumbnail jobs. Each one is mostly CPU-bound — going past
     * 2 on a 4-core CPU steals so much from HLS playback that videos buffer-stall.
     */
    private int maxParallel = 2;
    /** Per-job timeout. ffmpeg is force-killed past this. */
    private long timeoutMs = 15000;
    /** JPEG quality 1 (best) – 31 (worst). 4 is "visually lossless" for 480×270. */
    private int jpegQuality = 4;

    public String getCacheDir() { return cacheDir; }
    public void setCacheDir(String cacheDir) { this.cacheDir = cacheDir; }

    public int getMaxParallel() { return maxParallel; }
    public void setMaxParallel(int maxParallel) { this.maxParallel = maxParallel; }

    public long getTimeoutMs() { return timeoutMs; }
    public void setTimeoutMs(long timeoutMs) { this.timeoutMs = timeoutMs; }

    public int getJpegQuality() { return jpegQuality; }
    public void setJpegQuality(int jpegQuality) { this.jpegQuality = jpegQuality; }
}
