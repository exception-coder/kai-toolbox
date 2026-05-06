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

    /**
     * Delete {@code file} (already validated by {@link PathAccessGuard}) and remove its row
     * from {@code treesize_node}. Returns whether the OS-level move-to-trash actually fired
     * (false ⇒ permanent delete fallback).
     */
    public boolean deleteByPath(String scanId, Path file) throws IOException {
        boolean toTrash = false;
        if (Desktop.isDesktopSupported()) {
            Desktop desktop = Desktop.getDesktop();
            if (desktop.isSupported(Desktop.Action.MOVE_TO_TRASH)) {
                try {
                    toTrash = desktop.moveToTrash(file.toFile());
                } catch (UnsupportedOperationException | SecurityException e) {
                    log.debug("moveToTrash unavailable, falling back to permanent delete: {}", e.toString());
                }
            }
        }
        if (!toTrash) {
            Files.delete(file);
        }
        nodes.deleteByScanAndPath(scanId, file.toAbsolutePath().toString());
        return toTrash;
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
