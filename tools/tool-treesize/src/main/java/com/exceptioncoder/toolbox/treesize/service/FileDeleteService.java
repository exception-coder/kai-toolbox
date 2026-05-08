package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.VideoFile;
import com.exceptioncoder.toolbox.treesize.repository.NodeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.awt.Desktop;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Single-file deletion. Tries the OS recycle bin via {@link Desktop#moveToTrash(java.io.File)}
 * first; falls back to a permanent {@link Files#delete} when no desktop is available
 * (headless server, Linux without a trash spec implementation, etc).
 *
 * <p>The recycle-bin path is chosen by default because this is a personal local toolkit and
 * "I clicked the wrong file" is a far more common mistake than "the recycle bin is full".
 * If the underlying delete throws, we propagate without retrying — better to fail loudly
 * than to half-succeed.
 */
@Component
public class FileDeleteService {

    private static final Logger log = LoggerFactory.getLogger(FileDeleteService.class);

    private final NodeRepository nodes;

    public FileDeleteService(NodeRepository nodes) {
        this.nodes = nodes;
    }

    /** Backoff between attempts (ms). Length determines retry count = backoff.length + 1. */
    private static final long[] DELETE_BACKOFF_MS = {200L, 400L};

    /**
     * Delete {@code file} (already validated by {@link PathAccessGuard}) and remove its row
     * from {@code treesize_node}. Returns whether the OS-level move-to-trash actually fired
     * (false ⇒ permanent delete fallback).
     *
     * <p>Trash-first is intentional: if the user reports "I clicked the wrong file" the
     * recycle bin is the only path to recovery. When trash is unavailable the reason is
     * logged at WARN so the user can audit which deletes were permanent.
     *
     * <p>Both trash and permanent-delete paths retry with backoff because this service is
     * called against files the user may have just stopped watching: hls.js destroy, GET
     * teardown, and ffmpeg reap all take tens-to-hundreds of ms, during which Windows still
     * holds the read handle open and {@code moveToTrash} returns false (or {@code Files.delete}
     * throws "file in use"). One retry pass covers the realistic teardown window without
     * making cold deletes meaningfully slower.
     */
    public boolean deleteByPath(String scanId, Path file) throws IOException {
        String absPath = file.toAbsolutePath().toString();

        TrashOutcome trashOutcome = tryMoveToTrashWithRetry(file, absPath);
        if (trashOutcome.success) {
            nodes.deleteByScanAndPath(scanId, absPath);
            return true;
        }

        log.warn("delete: cannot move to recycle bin, falling back to PERMANENT delete. path={} reason={}",
                absPath, trashOutcome.reason);
        permanentDeleteWithRetry(file, absPath);
        nodes.deleteByScanAndPath(scanId, absPath);
        return false;
    }

    private TrashOutcome tryMoveToTrashWithRetry(Path file, String absPath) {
        if (!Desktop.isDesktopSupported()) {
            return TrashOutcome.failed("Desktop API unsupported on this JRE/headless environment");
        }
        Desktop desktop = Desktop.getDesktop();
        if (!desktop.isSupported(Desktop.Action.MOVE_TO_TRASH)) {
            return TrashOutcome.failed("Desktop.Action.MOVE_TO_TRASH unsupported on this OS");
        }

        String lastReason = null;
        int attempts = DELETE_BACKOFF_MS.length + 1;
        for (int i = 0; i < attempts; i++) {
            try {
                if (desktop.moveToTrash(file.toFile())) {
                    log.info("delete: moved to recycle bin path={} attempt={}/{}", absPath, i + 1, attempts);
                    return TrashOutcome.ok();
                }
                lastReason = "moveToTrash returned false (OS denied, file in use, or trash full)";
            } catch (UnsupportedOperationException | SecurityException e) {
                // These are platform-level "no" — retrying won't change the answer.
                return TrashOutcome.failed("moveToTrash threw "
                        + e.getClass().getSimpleName() + ": " + e.getMessage());
            }
            if (i < DELETE_BACKOFF_MS.length) {
                sleepQuiet(DELETE_BACKOFF_MS[i]);
            }
        }
        return TrashOutcome.failed(lastReason + " (after " + attempts + " attempts)");
    }

    private void permanentDeleteWithRetry(Path file, String absPath) throws IOException {
        IOException last = null;
        int attempts = DELETE_BACKOFF_MS.length + 1;
        for (int i = 0; i < attempts; i++) {
            try {
                Files.delete(file);
                log.warn("delete: permanent delete done path={} attempt={}/{}", absPath, i + 1, attempts);
                return;
            } catch (IOException e) {
                last = e;
                log.debug("delete: permanent delete attempt {}/{} failed for {}: {}",
                        i + 1, attempts, absPath, e.toString());
                if (i < DELETE_BACKOFF_MS.length) {
                    sleepQuiet(DELETE_BACKOFF_MS[i]);
                }
            }
        }
        log.error("delete: PERMANENT delete failed after {} attempts path={}", attempts, absPath, last);
        throw last;
    }

    private static void sleepQuiet(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    private record TrashOutcome(boolean success, String reason) {
        static TrashOutcome ok() { return new TrashOutcome(true, null); }
        static TrashOutcome failed(String reason) { return new TrashOutcome(false, reason); }
    }

    /** Aggregate result of a junk-cleanup pass. */
    public record CleanJunkResult(int deleted, int skipped, List<String> errors) {}

    /**
     * Delete files whose names look like AppleDouble cache (start with {@code ._}) and that
     * are still under {@code maxSizeBytes}. We re-check the on-disk size right before deletion
     * so a file that grew past the threshold since the scan is left alone — that is the
     * "safety net against accidentally nuking a real video that happens to start with a dot".
     *
     * <p>Per-file failures are caught and reported in {@link CleanJunkResult#errors}; a single
     * locked / permission-denied file does not abort the batch.
     */
    public CleanJunkResult cleanJunkVideos(List<String> videoExtensions, long maxSizeBytes) {
        List<VideoFile> candidates = nodes.findJunkVideos(videoExtensions, maxSizeBytes);
        int deleted = 0;
        int skipped = 0;
        List<String> errors = new ArrayList<>();
        for (VideoFile v : candidates) {
            Path file = Path.of(v.path());
            try {
                if (!Files.isRegularFile(file)) {
                    skipped++;
                    nodes.deleteByScanAndPath(v.scanId(), v.path());
                    continue;
                }
                long currentSize = Files.size(file);
                if (currentSize >= maxSizeBytes) {
                    skipped++;
                    log.info("junk-clean skipping {} (current size {} ≥ threshold {})",
                            file, currentSize, maxSizeBytes);
                    continue;
                }
                deleteByPath(v.scanId(), file);
                deleted++;
            } catch (IOException e) {
                String msg = v.path() + ": " + e.getMessage();
                errors.add(msg);
                log.warn("junk-clean failed for {}", v.path(), e);
            }
        }
        log.info("junk-clean complete: deleted={} skipped={} errors={}", deleted, skipped, errors.size());
        return new CleanJunkResult(deleted, skipped, errors);
    }
}
