package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.FailedDelete;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Bounded in-memory ledger of delete attempts that failed (typically "another program is
 * using this file" on Windows). Single entry per absolute path: subsequent failures bump
 * {@code attempts} and refresh {@code lastAttemptAt} rather than fanning out.
 *
 * <p>Bounded at {@link #MAX_ENTRIES}; oldest entry by {@code lastAttemptAt} is evicted when
 * full. Lives only in JVM memory — restart clears it, which matches the "the lock is
 * transient" expectation.
 */
@Component
public class FailedDeleteRegistry {

    private static final int MAX_ENTRIES = 500;

    private final Map<String, FailedDelete> entries = new ConcurrentHashMap<>();

    public void record(String scanId, String absPath, String reason) {
        entries.compute(absPath, (k, prev) -> {
            int attempts = prev == null ? 1 : prev.attempts() + 1;
            return new FailedDelete(scanId, absPath, reason, attempts, System.currentTimeMillis());
        });
        evictIfOverCapacity();
    }

    public void remove(String absPath) {
        entries.remove(absPath);
    }

    public void clear() {
        entries.clear();
    }

    public List<FailedDelete> list() {
        return entries.values().stream()
                .sorted(Comparator.comparingLong(FailedDelete::lastAttemptAt).reversed())
                .toList();
    }

    private void evictIfOverCapacity() {
        while (entries.size() > MAX_ENTRIES) {
            entries.entrySet().stream()
                    .min(Comparator.comparingLong(e -> e.getValue().lastAttemptAt()))
                    .ifPresent(e -> entries.remove(e.getKey()));
        }
    }
}
