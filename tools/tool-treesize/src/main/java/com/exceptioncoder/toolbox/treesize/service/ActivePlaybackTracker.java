package com.exceptioncoder.toolbox.treesize.service;

import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Marker timestamp for "user is actively playing right now". Touched by HLS / raw-stream
 * endpoints; consulted by the background thumbnail warmer so it can stop forking ffmpegs
 * while the user is watching, freeing up CPU and disk for the playback path.
 *
 * <p>The tracker doesn't lock anything — it's just a hint. ffmpeg processes run in true OS
 * parallel; this hint reduces resource contention without enforcing serialization.
 */
@Component
public class ActivePlaybackTracker {

    private final AtomicLong lastActivityMs = new AtomicLong(0);

    /** Record that a playback request just hit the backend. Cheap; safe from any thread. */
    public void touch() {
        lastActivityMs.set(System.currentTimeMillis());
    }

    /** True if a playback request landed within the last {@code quietMs} milliseconds. */
    public boolean recentlyActive(long quietMs) {
        long last = lastActivityMs.get();
        if (last == 0) return false;
        return System.currentTimeMillis() - last < quietMs;
    }
}
