package com.exceptioncoder.toolbox.common.media;

/**
 * Thrown when an endpoint that requires ffmpeg / ffprobe is invoked but the startup probe failed.
 * {@code GlobalExceptionHandler} translates this to HTTP 503.
 */
public class FfmpegUnavailableException extends RuntimeException {
    public FfmpegUnavailableException(String message) {
        super(message);
    }
}
