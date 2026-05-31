package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.DeleteOutcome;
import com.exceptioncoder.toolbox.treesize.domain.FailedDelete;
import com.exceptioncoder.toolbox.treesize.domain.VideoFile;
import com.exceptioncoder.toolbox.treesize.repository.NodeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.awt.Desktop;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
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
 *
 * <p>When all retries are exhausted with a {@link java.nio.file.FileSystemException} or other
 * {@link IOException} (Windows "another program is using this file" being the canonical case),
 * the path is recorded in {@link FailedDeleteRegistry} and the caller gets
 * {@link DeleteOutcome#QUEUED} instead of an exception — closing the holding process and
 * triggering a batch retry is the recovery path.
 */
@Component
public class FileDeleteService {

    private static final Logger log = LoggerFactory.getLogger(FileDeleteService.class);

    private final NodeRepository nodes;
    private final FailedDeleteRegistry failedDeletes;

    public FileDeleteService(NodeRepository nodes, FailedDeleteRegistry failedDeletes) {
        this.nodes = nodes;
        this.failedDeletes = failedDeletes;
    }

    /** Backoff between attempts (ms). Length determines retry count = backoff.length + 1. */
    private static final long[] DELETE_BACKOFF_MS = {200L, 400L};

    /**
     * Delete {@code file} (already validated by {@link PathAccessGuard}) and remove its row
     * from {@code treesize_node}.
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
    public DeleteOutcome deleteByPath(String scanId, Path file) throws IOException {
        String absPath = file.toAbsolutePath().toString();

        TrashOutcome trashOutcome = tryMoveToTrashWithRetry(file, absPath);
        if (trashOutcome.success) {
            onDeleted(scanId, absPath);
            return DeleteOutcome.TRASHED;
        }

        log.warn("delete: cannot move to recycle bin, falling back to PERMANENT delete. path={} reason={}",
                absPath, trashOutcome.reason);
        DeleteOutcome permanent = permanentDeleteWithRetry(scanId, file, absPath, trashOutcome.reason);
        if (permanent == DeleteOutcome.PERMANENT) {
            onDeleted(scanId, absPath);
        }
        return permanent;
    }

    /**
     * Retry every previously-failed entry. {@link NoSuchFileException} during retry counts as
     * "already gone" — the row is removed from the registry and credited as deleted.
     */
    public RetryResult retryAllFailed() {
        List<FailedDelete> snapshot = failedDeletes.list();
        int deleted = 0;
        int queued = 0;
        for (FailedDelete entry : snapshot) {
            Path file = Path.of(entry.path());
            try {
                DeleteOutcome outcome = deleteByPath(entry.scanId(), file);
                switch (outcome) {
                    case TRASHED, PERMANENT -> deleted++;
                    case QUEUED -> queued++;
                }
            } catch (NoSuchFileException nsf) {
                // File vanished between attempts — treat as deleted from our point of view.
                failedDeletes.remove(entry.path());
                nodes.deleteByScanAndPath(entry.scanId(), entry.path());
                deleted++;
            } catch (IOException ioe) {
                // Should not happen — deleteByPath swallows IO into QUEUED — but be defensive.
                log.warn("retry: unexpected IOException for {}", entry.path(), ioe);
                failedDeletes.record(entry.scanId(), entry.path(), ioe.toString());
                queued++;
            }
        }
        return new RetryResult(snapshot.size(), deleted, queued, failedDeletes.list());
    }

    public List<FailedDelete> listFailed() {
        return failedDeletes.list();
    }

    public void clearFailed() {
        failedDeletes.clear();
    }

    public void removeFailed(String absPath) {
        failedDeletes.remove(absPath);
    }

    /** Aggregate of {@link #retryAllFailed()} — counts plus the still-failing tail. */
    public record RetryResult(int attempted, int deleted, int queued, List<FailedDelete> remaining) {}

    /**
     * 文件在磁盘上已不存在（被 OS / 其它程序删掉）：不碰磁盘，直接清掉对应的 treesize_node 记录，
     * 让它从视频库列表消失，避免页面一直搜出不存在的内容。按 (scanId, 原始路径) 精确匹配删除，
     * 只会删掉本就在库里的行，无越权风险。
     */
    public void purgeMissingRecord(String scanId, String requestedPath) {
        nodes.deleteByScanAndPath(scanId, requestedPath);
        failedDeletes.remove(requestedPath);
        nodes.invalidateVideoLibraryCache();
        log.info("delete: file already gone on disk, purged db record scanId={} path={}", scanId, requestedPath);
    }

    private void onDeleted(String scanId, String absPath) {
        nodes.deleteByScanAndPath(scanId, absPath);
        failedDeletes.remove(absPath);
        nodes.invalidateVideoLibraryCache();
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

    private DeleteOutcome permanentDeleteWithRetry(String scanId, Path file, String absPath, String trashReason)
            throws IOException {
        IOException last = null;
        int attempts = DELETE_BACKOFF_MS.length + 1;
        for (int i = 0; i < attempts; i++) {
            try {
                Files.delete(file);
                log.warn("delete: permanent delete done path={} attempt={}/{}", absPath, i + 1, attempts);
                return DeleteOutcome.PERMANENT;
            } catch (NoSuchFileException nsf) {
                // The caller's initial isRegularFile check already passed, so this is a TOCTOU
                // window — propagate so the controller maps it to 404 like before.
                throw nsf;
            } catch (IOException e) {
                last = e;
                log.debug("delete: permanent delete attempt {}/{} failed for {}: {}",
                        i + 1, attempts, absPath, e.toString());
                if (i < DELETE_BACKOFF_MS.length) {
                    sleepQuiet(DELETE_BACKOFF_MS[i]);
                }
            }
        }
        // All retries exhausted: the file is locked (or otherwise unavailable). Park it in the
        // registry instead of throwing — the caller is the user, and the recovery path is
        // "close the holding program, click retry".
        String reason = last != null ? messageOf(last) : trashReason;
        failedDeletes.record(scanId, absPath, reason);
        log.warn("delete: queued for later retry path={} attempts={} reason={}", absPath, attempts, reason);
        return DeleteOutcome.QUEUED;
    }

    private static String messageOf(IOException e) {
        String msg = e.getMessage();
        return msg != null ? msg : e.getClass().getSimpleName();
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
    public record CleanJunkResult(int deleted, int skipped, int queued, List<String> errors) {}

    /**
     * Delete files whose names look like AppleDouble cache (start with {@code ._}) and that
     * are still under {@code maxSizeBytes}. We re-check the on-disk size right before deletion
     * so a file that grew past the threshold since the scan is left alone — that is the
     * "safety net against accidentally nuking a real video that happens to start with a dot".
     *
     * <p>Per-file IO failures land in {@link FailedDeleteRegistry} via
     * {@link #deleteByPath} (counted as {@code queued}); unexpected exceptions go to
     * {@link CleanJunkResult#errors}.
     */
    public CleanJunkResult cleanJunkVideos(List<String> videoExtensions, long maxSizeBytes) {
        List<VideoFile> candidates = nodes.findJunkVideos(videoExtensions, maxSizeBytes);
        int deleted = 0;
        int skipped = 0;
        int queued = 0;
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
                DeleteOutcome outcome = deleteByPath(v.scanId(), file);
                switch (outcome) {
                    case TRASHED, PERMANENT -> deleted++;
                    case QUEUED -> queued++;
                }
            } catch (IOException e) {
                String msg = v.path() + ": " + e.getMessage();
                errors.add(msg);
                log.warn("junk-clean failed for {}", v.path(), e);
            }
        }
        log.info("junk-clean complete: deleted={} skipped={} queued={} errors={}",
                deleted, skipped, queued, errors.size());
        return new CleanJunkResult(deleted, skipped, queued, errors);
    }
}
