package com.exceptioncoder.toolbox.treesize.repository;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * Process-local TTL cache for the {@code SELECT COUNT(*)} on the video library page. The count
 * is recomputed only when its TTL elapses or a known-mutating event ({@link #invalidateAll})
 * fires (scan completion, file deletion, favorite toggle).
 *
 * <p>Bounded by natural filter cardinality — {@code sizeBucket × q × favoritesOnly} tuples for
 * the typical user is well under 100 entries, so no eviction policy is needed.
 */
@Component
public class VideoLibraryCountCache {

    private static final long TTL_MS = 30_000L;

    private final Map<String, Entry> cache = new ConcurrentHashMap<>();

    public long getOrCompute(String key, LongSupplier loader) {
        long now = System.currentTimeMillis();
        Entry e = cache.get(key);
        if (e != null && e.expiresAt > now) return e.value;
        long v = loader.getAsLong();
        cache.put(key, new Entry(v, now + TTL_MS));
        return v;
    }

    public void invalidateAll() {
        cache.clear();
    }

    private record Entry(long value, long expiresAt) {}
}
