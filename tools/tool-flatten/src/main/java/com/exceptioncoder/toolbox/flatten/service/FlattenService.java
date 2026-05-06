package com.exceptioncoder.toolbox.flatten.service;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.flatten.domain.FlattenFile;
import com.exceptioncoder.toolbox.flatten.domain.FlattenScan;
import com.exceptioncoder.toolbox.flatten.domain.FlattenStatus;
import com.exceptioncoder.toolbox.flatten.repository.FlattenFileRepository;
import com.exceptioncoder.toolbox.flatten.repository.FlattenScanRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class FlattenService {

    private static final Logger log = LoggerFactory.getLogger(FlattenService.class);
    private static final int BATCH_SIZE = 1000;

    private final ScanEngine scanEngine;
    private final MoveEngine moveEngine;
    private final FlattenScanRepository scans;
    private final FlattenFileRepository files;
    private final SseEmitterRegistry sse;

    private final ExecutorService executor = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("flatten-", 0).factory()
    );
    private final ConcurrentHashMap<String, AtomicBoolean> cancelFlags = new ConcurrentHashMap<>();

    public FlattenService(ScanEngine scanEngine,
                          MoveEngine moveEngine,
                          FlattenScanRepository scans,
                          FlattenFileRepository files,
                          SseEmitterRegistry sse) {
        this.scanEngine = scanEngine;
        this.moveEngine = moveEngine;
        this.scans = scans;
        this.files = files;
        this.sse = sse;
    }

    public static String scanEventsKey(String id) { return "flatten:" + id + ":scan"; }
    public static String moveEventsKey(String id) { return "flatten:" + id + ":move"; }

    // ------------------------------------------------------------------ scan

    public FlattenScan startScan(String sourcePath, String targetPath) {
        Path source = Paths.get(sourcePath);
        Path target = Paths.get(targetPath);
        if (!Files.exists(source))                throw new IllegalArgumentException("source not found: " + sourcePath);
        if (!Files.isDirectory(source))           throw new IllegalArgumentException("source is not a directory: " + sourcePath);
        if (Files.exists(target) && !Files.isDirectory(target)) {
            throw new IllegalArgumentException("target is not a directory: " + targetPath);
        }
        Path absSource = source.toAbsolutePath().normalize();
        Path absTarget = target.toAbsolutePath().normalize();
        if (absSource.equals(absTarget)) {
            throw new IllegalArgumentException("source and target must differ");
        }
        if (absTarget.startsWith(absSource)) {
            throw new IllegalArgumentException("target must not be inside source");
        }

        String id = UUID.randomUUID().toString();
        FlattenScan record = FlattenScan.builder()
                .id(id)
                .sourcePath(absSource.toString())
                .targetPath(absTarget.toString())
                .status(FlattenStatus.SCANNING)
                .startedAt(System.currentTimeMillis())
                .build();
        scans.insert(record);

        AtomicBoolean cancelled = new AtomicBoolean(false);
        cancelFlags.put(id, cancelled);
        executor.submit(() -> runScan(id, absSource, cancelled));
        return record;
    }

    private void runScan(String id, Path source, AtomicBoolean cancelled) {
        String sseKey = scanEventsKey(id);
        try {
            ScanEngine.Result result = scanEngine.scan(
                    id, source,
                    progress -> sse.publish(sseKey, "progress", Map.of(
                            "scanned", progress.scanned(),
                            "hashed", progress.hashed(),
                            "totalSize", progress.totalSize(),
                            "currentPath", progress.currentPath()
                    )),
                    cancelled::get
            );

            // Persist all file rows in batches.
            List<FlattenFile> buffer = new ArrayList<>(BATCH_SIZE);
            for (FlattenFile f : result.files()) {
                buffer.add(f);
                if (buffer.size() >= BATCH_SIZE) {
                    files.batchInsert(buffer);
                    buffer.clear();
                }
            }
            if (!buffer.isEmpty()) files.batchInsert(buffer);

            // Aggregate duplicates.
            Map<String, List<FlattenFile>> byHash = new HashMap<>();
            for (FlattenFile f : result.files()) {
                if (f.getHash() != null) byHash.computeIfAbsent(f.getHash(), k -> new ArrayList<>()).add(f);
            }
            long dupGroups = 0, dupFiles = 0, dupSize = 0;
            for (List<FlattenFile> bucket : byHash.values()) {
                if (bucket.size() < 2) continue;
                dupGroups += 1;
                dupFiles += bucket.size();
                dupSize += (long) (bucket.size() - 1) * bucket.get(0).getSize();
            }
            long filesToMove = result.files().size() - (dupFiles - dupGroups);

            scans.updateScanResult(id,
                    result.files().size(), result.totalSize(),
                    dupGroups, dupFiles, dupSize, filesToMove);
            scans.updateStatus(id, FlattenStatus.SCANNED, null, null);

            sse.publish(sseKey, "completed", Map.of(
                    "totalFiles", result.files().size(),
                    "totalSize", result.totalSize(),
                    "duplicateGroups", dupGroups,
                    "duplicateFiles", dupFiles,
                    "duplicateSize", dupSize
            ));
        } catch (CancellationException ce) {
            scans.updateStatus(id, FlattenStatus.CANCELLED, System.currentTimeMillis(), null);
            sse.publish(sseKey, "cancelled", Map.of("scanId", id));
        } catch (Exception e) {
            log.error("flatten scan {} failed", id, e);
            scans.updateStatus(id, FlattenStatus.FAILED, System.currentTimeMillis(),
                    e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            sse.publish(sseKey, "error", Map.of("message",
                    e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        } finally {
            cancelFlags.remove(id);
            sse.complete(sseKey);
        }
    }

    // ----------------------------------------------------------------- dedupe

    public DedupeOutcome deleteDuplicates(String id, List<String> keepPaths) {
        FlattenScan scan = requireScan(id);
        if (scan.getStatus() != FlattenStatus.SCANNED) {
            throw new IllegalStateException("cannot dedupe in status " + scan.getStatus());
        }
        java.util.Set<String> keepSet = new java.util.HashSet<>(keepPaths);

        // Group duplicates and decide which to delete.
        List<FlattenFile> dupRows = files.findDuplicates(id);
        Map<String, List<FlattenFile>> byHash = new java.util.LinkedHashMap<>();
        for (FlattenFile f : dupRows) {
            byHash.computeIfAbsent(f.getHash(), k -> new ArrayList<>()).add(f);
        }
        List<String> toDelete = new ArrayList<>();
        long freedSize = 0;
        for (List<FlattenFile> bucket : byHash.values()) {
            FlattenFile kept = bucket.stream()
                    .filter(f -> keepSet.contains(f.getPath()))
                    .findFirst()
                    .orElse(bucket.get(0));
            for (FlattenFile f : bucket) {
                if (f.getPath().equals(kept.getPath())) continue;
                toDelete.add(f.getPath());
                freedSize += f.getSize();
            }
        }

        // Remove from disk first; on filesystem error, mark them deleted in DB anyway so the user
        // can retry/skip without being stuck. The errors surface via the response.
        int diskFailures = 0;
        for (String p : toDelete) {
            try {
                Files.deleteIfExists(Path.of(p));
            } catch (Exception e) {
                diskFailures += 1;
                log.warn("failed to delete duplicate {}: {}", p, e.toString());
            }
        }
        files.markDeletedByPaths(id, toDelete);

        // Recompute totals after dedupe.
        long activeCount = files.findActive(id).stream().count();
        long activeSize = files.findActive(id).stream().mapToLong(FlattenFile::getSize).sum();
        scans.updateAfterDedupe(id, activeCount, activeSize, activeCount);
        scans.updateStatus(id, FlattenStatus.READY, null, null);

        return new DedupeOutcome(toDelete.size(), freedSize, diskFailures);
    }

    public FlattenScan skipDedupe(String id) {
        FlattenScan scan = requireScan(id);
        if (scan.getStatus() != FlattenStatus.SCANNED) {
            throw new IllegalStateException("cannot skip in status " + scan.getStatus());
        }
        long activeCount = files.findActive(id).size();
        scans.updateAfterDedupe(id, scan.getTotalFiles(), scan.getTotalSize(), activeCount);
        scans.updateStatus(id, FlattenStatus.READY, null, null);
        return requireScan(id);
    }

    // ------------------------------------------------------------------- move

    public List<FlattenFile> getMovePlan(String id) {
        FlattenScan scan = requireScan(id);
        if (scan.getStatus() == FlattenStatus.SCANNING) {
            throw new IllegalStateException("scan still running");
        }
        List<FlattenFile> active = files.findActive(id);
        // Re-validate every call: a cached plan made when the target dir was empty can collide
        // with files dropped in later (by another scan, an external process, or this scan's own
        // earlier failed move). planTargetNames is idempotent and re-picks only the entries
        // whose old name now conflicts.
        Map<Long, String> before = new HashMap<>(active.size());
        for (FlattenFile f : active) before.put(f.getId(), f.getTargetName());
        try {
            moveEngine.planTargetNames(Path.of(scan.getTargetPath()), active);
        } catch (java.io.IOException e) {
            throw new RuntimeException("failed to read target dir: " + e.getMessage(), e);
        }
        for (FlattenFile f : active) {
            if (!Objects.equals(before.get(f.getId()), f.getTargetName())) {
                files.updateTargetName(f.getId(), f.getTargetName());
            }
        }
        return active;
    }

    public FlattenScan startMove(String id) {
        FlattenScan scan = requireScan(id);
        if (scan.getStatus() != FlattenStatus.READY && scan.getStatus() != FlattenStatus.SCANNED) {
            throw new IllegalStateException("cannot start move in status " + scan.getStatus());
        }
        List<FlattenFile> plan = getMovePlan(id);
        scans.updateStatus(id, FlattenStatus.MOVING, null, null);

        AtomicBoolean cancelled = new AtomicBoolean(false);
        cancelFlags.put(id, cancelled);
        executor.submit(() -> runMove(id, Path.of(scan.getTargetPath()), plan, cancelled));
        return requireScan(id);
    }

    private void runMove(String id, Path target, List<FlattenFile> plan, AtomicBoolean cancelled) {
        String sseKey = moveEventsKey(id);
        try {
            MoveEngine.Result result = moveEngine.move(
                    target, plan,
                    progress -> {
                        scans.updateMovedFiles(id, progress.moved());
                        sse.publish(sseKey, "progress", Map.of(
                                "moved", progress.moved(),
                                "total", progress.total(),
                                "currentFile", progress.currentFile()
                        ));
                    },
                    cancelled::get
            );
            for (FlattenFile f : plan) {
                if (!f.isMoved()) continue;
                if (f.isRenamed()) files.updateTargetName(f.getId(), f.getTargetName());
                files.markMoved(f.getId());
            }
            scans.updateStatus(id, FlattenStatus.COMPLETED, System.currentTimeMillis(), null);
            sse.publish(sseKey, "completed", Map.of("movedFiles", result.moved()));
        } catch (CancellationException ce) {
            scans.updateStatus(id, FlattenStatus.CANCELLED, System.currentTimeMillis(), null);
            sse.publish(sseKey, "cancelled", Map.of("scanId", id));
        } catch (Exception e) {
            log.error("flatten move {} failed", id, e);
            scans.updateStatus(id, FlattenStatus.FAILED, System.currentTimeMillis(),
                    e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            sse.publish(sseKey, "error", Map.of("message",
                    e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        } finally {
            cancelFlags.remove(id);
            sse.complete(sseKey);
        }
    }

    // ------------------------------------------------------------------ misc

    public void cancel(String id) {
        AtomicBoolean flag = cancelFlags.get(id);
        if (flag != null) flag.set(true);
    }

    private FlattenScan requireScan(String id) {
        return scans.findById(id).orElseThrow(() -> new IllegalArgumentException("scan not found: " + id));
    }

    public record DedupeOutcome(int deleted, long freedSize, int diskFailures) {}
}
