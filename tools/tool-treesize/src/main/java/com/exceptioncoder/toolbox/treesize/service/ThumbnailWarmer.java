package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.media.ThumbnailService;
import com.exceptioncoder.toolbox.treesize.config.VideoExtensionsProperties;
import com.exceptioncoder.toolbox.treesize.domain.VideoFile;
import com.exceptioncoder.toolbox.treesize.repository.NodeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Background pass over every video in every completed scan, warming the on-disk thumbnail
 * cache so the user-visible {@code <img>} requests are nearly all cache hits.
 *
 * <p>Reuses {@link NodeRepository#findVideos} with the same filter the {@code /api/treesize/videos}
 * controller method uses (extension whitelist minus {@code .ts}, recycle-bin / system-folder
 * exclusions baked into the SQL), so it never hands a non-video file or a recycle-bin entry to
 * ffmpeg.
 *
 * <p>Sequential within the warm-up loop — between iterations the semaphore inside
 * {@code ThumbnailService} is released, letting any on-demand thumbnail request from the user
 * jump in. Concurrency cap stays {@code toolbox.thumbnail.max-parallel}.
 */
@Component
public class ThumbnailWarmer {

    private static final Logger log = LoggerFactory.getLogger(ThumbnailWarmer.class);
    private static final int BATCH_SIZE = 500;
    /** Don't fork a new ffmpeg if the user touched a playback endpoint in the last 15 s. */
    private static final long PLAYBACK_QUIET_MS = 15_000;
    private static final long PLAYBACK_POLL_MS = 2_000;

    private final ThumbnailService thumbnails;
    private final NodeRepository nodes;
    private final VideoExtensionsProperties videoExt;
    private final ActivePlaybackTracker playbackTracker;

    /** Holds the currently-running warm-up thread, or {@code null} when idle. */
    private final AtomicReference<Thread> running = new AtomicReference<>();

    public ThumbnailWarmer(ThumbnailService thumbnails,
                           NodeRepository nodes,
                           VideoExtensionsProperties videoExt,
                           ActivePlaybackTracker playbackTracker) {
        this.thumbnails = thumbnails;
        this.nodes = nodes;
        this.videoExt = videoExt;
        this.playbackTracker = playbackTracker;
    }

    /**
     * Idempotent. If a warm-up is already in flight this is a no-op; otherwise a virtual thread
     * starts walking the library.
     */
    public void kickOff() {
        Thread next = Thread.ofVirtual().name("thumb-warmer").unstarted(this::run);
        if (running.compareAndSet(null, next)) {
            next.start();
        }
    }

    private void run() {
        try {
            // Mirror the /videos controller's filter: drop {@code .ts} (TypeScript collision).
            List<String> exts = videoExt.getExtensions().stream()
                    .filter(e -> !"ts".equalsIgnoreCase(e))
                    .toList();
            if (exts.isEmpty()) return;

            long start = System.currentTimeMillis();
            int processed = 0;
            int failed = 0;
            int offset = 0;

            while (!Thread.currentThread().isInterrupted()) {
                NodeRepository.VideoSearchResult page =
                        nodes.findVideos(exts, "name", "asc", 0L, Long.MAX_VALUE,
                                null, false, List.of(), offset, BATCH_SIZE);
                if (page.items().isEmpty()) break;
                for (VideoFile v : page.items()) {
                    if (Thread.currentThread().isInterrupted()) break;
                    // Yield CPU + disk to user-initiated playback. Polls every 2 s and keeps
                    // sleeping until the user has been quiet for 15 s.
                    while (playbackTracker.recentlyActive(PLAYBACK_QUIET_MS)) {
                        try {
                            Thread.sleep(PLAYBACK_POLL_MS);
                        } catch (InterruptedException ie) {
                            Thread.currentThread().interrupt();
                            return;
                        }
                    }
                    Path src = Path.of(v.path());
                    if (!Files.isRegularFile(src)) continue;
                    try {
                        thumbnails.getOrGenerate(src);
                    } catch (Exception e) {
                        // Bad / unsupported / locked file. {@code .failed} marker is already
                        // written inside ThumbnailService, so the next pass won't retry.
                        failed++;
                    }
                    processed++;
                }
                if (page.items().size() < BATCH_SIZE) break;
                offset += page.items().size();
            }
            long elapsed = System.currentTimeMillis() - start;
            log.info("thumbnail warm-up done: processed={} failed={} elapsed={}ms",
                    processed, failed, elapsed);
        } catch (Exception e) {
            log.warn("thumbnail warm-up aborted: {}", e.toString());
        } finally {
            running.set(null);
        }
    }
}
