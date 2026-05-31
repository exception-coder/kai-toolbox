package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProbe;
import com.exceptioncoder.toolbox.common.media.FfmpegProcessRegistry;
import com.exceptioncoder.toolbox.common.media.FfmpegProperties;
import com.exceptioncoder.toolbox.common.media.ProbeResult;
import com.exceptioncoder.toolbox.common.media.ThumbnailProperties;
import com.exceptioncoder.toolbox.treesize.domain.ProcessingJobType;
import com.exceptioncoder.toolbox.treesize.domain.VideoRow;
import com.exceptioncoder.toolbox.treesize.repository.VideoTableRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

/**
 * 视频九宫格预览图任务：按 size DESC 扫 {@code thumbnail_grid_path IS NULL} 的视频，
 * 单条 ffmpeg 命令（{@code fps + scale + pad + tile=3x3}）一次性出 9 帧拼接 JPEG，
 * 写到 {@code {thumb.cache-dir}/grid/{sha256(absPath)[0:16]}.jpg}，回写视频表。
 *
 * <p>缓存命中：磁盘已有但库字段为 NULL 时，跳过 ffmpeg 直接 UPDATE——典型场景是上次任务
 * 已生成图但写库前进程被强杀。
 *
 * <p>与 {@link VideoLanguageDetectionService}（GPU）独立判定：两者允许并行运行，因为前者
 * 走 GPU、本者主要走 CPU/解码，负载性质不同。
 */
@Service
public class VideoThumbnailGridService {

    private static final Logger log = LoggerFactory.getLogger(VideoThumbnailGridService.class);

    /** 网格规格固定 3×3=9 帧，行业惯例（VLC / mpv / 影视资源站）。 */
    private static final int GRID_COLS = 3;
    private static final int GRID_ROWS = 3;
    /** 单帧 320×180（16:9），竖屏视频自动 pad 黑边。 */
    private static final int CELL_W = 320;
    private static final int CELL_H = 180;
    /** 太短判 too_short 跳过。 */
    private static final double MIN_DURATION_S = 2.0;
    /** 单文件 ffmpeg 硬超时。大文件 seek 慢，120s 留余量。 */
    private static final int FFMPEG_TIMEOUT_S = 120;
    /** 每批拉 50 行。 */
    private static final int BATCH_SIZE = 50;
    /** 用户播放后多久内不抢 CPU。 */
    private static final long PLAYBACK_QUIET_MS = 15_000;
    private static final long PLAYBACK_POLL_MS = 2_000;
    /** error_msg 列硬限制。 */
    private static final int ERROR_MSG_MAX = 500;

    private final VideoProcessingJobService jobService;
    private final VideoTableRepository videoRepo;
    private final FfmpegProcessRegistry ffmpeg;
    private final FfmpegProbe ffprobe;
    private final FfmpegProperties ffmpegProps;
    private final ThumbnailProperties thumbProps;
    private final ActivePlaybackTracker playback;

    private Path gridCacheDir;

    public VideoThumbnailGridService(VideoProcessingJobService jobService,
                                      VideoTableRepository videoRepo,
                                      FfmpegProcessRegistry ffmpeg,
                                      FfmpegProbe ffprobe,
                                      FfmpegProperties ffmpegProps,
                                      ThumbnailProperties thumbProps,
                                      ActivePlaybackTracker playback) {
        this.jobService = jobService;
        this.videoRepo = videoRepo;
        this.ffmpeg = ffmpeg;
        this.ffprobe = ffprobe;
        this.ffmpegProps = ffmpegProps;
        this.thumbProps = thumbProps;
        this.playback = playback;
    }

    @PostConstruct
    void initCacheDir() throws IOException {
        // 与 ThumbnailService 相同的解析策略：yml 配的优先,否则 fallback 到 user-home。
        String base = thumbProps.getCacheDir();
        if (base == null || base.isBlank()) {
            base = System.getProperty("user.home") + "/.kai-toolbox/cache/thumbs";
        }
        gridCacheDir = Path.of(base, "grid");
        Files.createDirectories(gridCacheDir);
        log.info("video thumbnail grids cached at {}", gridCacheDir);
    }

    public Optional<String> start() {
        if (!ffprobe.isFfmpegAvailable()) {
            throw new IllegalStateException("ffmpeg unavailable (configure toolbox.ffmpeg.binary)");
        }
        if (!Files.isWritable(gridCacheDir)) {
            throw new IllegalStateException("grid cache dir not writable: " + gridCacheDir);
        }
        // 静默使用 ffmpegProps 避免未使用警告：保留依赖供未来调参（hwaccel 等）。
        if (ffmpegProps.getBinary() == null || ffmpegProps.getBinary().isBlank()) {
            throw new IllegalStateException("ffmpeg binary path not configured");
        }
        return jobService.startJob(ProcessingJobType.THUMBNAIL_GRID, this::workerLoop);
    }

    public void stop() {
        jobService.cancelJob(ProcessingJobType.THUMBNAIL_GRID);
    }

    private void workerLoop(VideoProcessingJobService.JobContext ctx) {
        long total = videoRepo.countNeedingThumbnailGrid();
        jobService.setTotal(ctx, total);
        while (!ctx.cancelled().get()) {
            List<VideoRow> batch = videoRepo.findNeedingThumbnailGrid(BATCH_SIZE, 0);
            if (batch.isEmpty()) break;
            for (VideoRow v : batch) {
                if (ctx.cancelled().get()) break;
                waitForPlaybackQuiet();
                generateOne(ctx, v);
            }
        }
    }

    private void generateOne(VideoProcessingJobService.JobContext ctx, VideoRow v) {
        Path src = Path.of(v.path());
        if (!Files.isRegularFile(src)) {
            recordGridFailure(ctx, v.path(), "file_not_found");
            return;
        }
        try {
            Path outPath = gridPathFor(v.path());
            // 缓存命中：磁盘已有但库未回填 → 不重跑 ffmpeg
            if (Files.exists(outPath) && Files.size(outPath) > 0) {
                videoRepo.updateThumbnailGrid(v.path(), outPath.toString(), System.currentTimeMillis());
                jobService.recordSuccess(ctx, v.path());
                return;
            }
            double durationS = resolveDuration(v, src);
            if (durationS < MIN_DURATION_S) {
                recordGridFailure(ctx, v.path(), "too_short");
                return;
            }
            ffmpeg.makeContactSheet(src, durationS, GRID_COLS, GRID_ROWS, CELL_W, CELL_H,
                    outPath, FFMPEG_TIMEOUT_S);
            videoRepo.updateThumbnailGrid(v.path(), outPath.toString(), System.currentTimeMillis());
            jobService.recordSuccess(ctx, v.path());
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            recordGridFailure(ctx, v.path(), summarize(e));
            log.debug("thumbnail grid failed for {}", v.path(), e);
        }
    }

    /**
     * 生成失败统一出口：先给视频行盖 thumbnail_grid_generated_at 让它离开待生成队列
     * （grid_path 仍 NULL），再上报 job 失败计数。否则失败行永远满足 generated_at IS NULL，
     * 会被反复重生成（进度超量堆叠）。
     */
    private void recordGridFailure(VideoProcessingJobService.JobContext ctx, String path, String reason) {
        videoRepo.markThumbnailGridAttempted(path, System.currentTimeMillis());
        jobService.recordFailure(ctx, path, reason);
    }

    /**
     * 取图：查库拿 grid_path → 校验文件存在 → 返回 InputStream。controller 直接 transferTo response。
     * 找不到行或缓存文件被删 → 抛 NoSuchFileException，controller 转 404。
     */
    public InputStream openGridStream(String videoPath) throws IOException {
        Optional<String> gridPath = videoRepo.findGridPathByVideoPath(videoPath);
        if (gridPath.isEmpty()) throw new NoSuchFileException("grid not generated for: " + videoPath);
        Path p = Path.of(gridPath.get());
        if (!Files.isRegularFile(p)) throw new NoSuchFileException("grid cache file gone: " + p);
        return Files.newInputStream(p);
    }

    private double resolveDuration(VideoRow v, Path src) throws IOException {
        if (v.durationS() != null && v.durationS() > 0) return v.durationS();
        ProbeResult r = ffprobe.probe(src);
        return r.durationSeconds();
    }

    private Path gridPathFor(String videoAbsPath) {
        String hash = sha256Hex(videoAbsPath).substring(0, 16);
        return gridCacheDir.resolve(hash + ".jpg");
    }

    private static String sha256Hex(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private void waitForPlaybackQuiet() {
        while (playback.recentlyActive(PLAYBACK_QUIET_MS)) {
            try {
                Thread.sleep(PLAYBACK_POLL_MS);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private static String summarize(Throwable e) {
        String m = e.getClass().getSimpleName() + ": "
                + (e.getMessage() == null ? "" : e.getMessage());
        return m.length() > ERROR_MSG_MAX ? m.substring(0, ERROR_MSG_MAX) : m;
    }
}
