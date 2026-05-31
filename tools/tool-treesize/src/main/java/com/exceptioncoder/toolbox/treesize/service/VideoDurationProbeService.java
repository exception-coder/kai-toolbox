package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProbe;
import com.exceptioncoder.toolbox.common.media.ProbeResult;
import com.exceptioncoder.toolbox.treesize.domain.DurationBucket;
import com.exceptioncoder.toolbox.treesize.domain.ProcessingJobType;
import com.exceptioncoder.toolbox.treesize.domain.VideoRow;
import com.exceptioncoder.toolbox.treesize.repository.VideoTableRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/**
 * 视频时长区间分类任务：按 size DESC 扫 {@code duration_s IS NULL} 的视频，
 * 调 {@link FfmpegProbe#probe(Path)} 拿真实时长，再按 {@link DurationBucket#fromSeconds(double)}
 * 算出区间标签，整体写回 {@code treesize_video}。
 *
 * <p>探测失败 / 文件缺失 / duration<=0 时写 {@code duration_bucket='unknown'} +
 * recordFailure（带 reason），让前端能区分"还没探测"与"已探测但不可读"——前者
 * 走 partial index 下次任务会重跑，后者已落库不再重试。
 *
 * <p>礼让用户播放：复用 {@link ActivePlaybackTracker#recentlyActive(long)}，与
 * ThumbnailWarmer / 其他子任务统一节奏，避免和正在看片的 ffmpeg 抢 CPU。
 */
@Service
public class VideoDurationProbeService {

    private static final Logger log = LoggerFactory.getLogger(VideoDurationProbeService.class);

    /** 任务循环每批拉多少行；ffprobe 单次 < 200ms，50 行 ≈ 10s 一批，正好让 RUNNING 行的 processed 流畅刷新。 */
    private static final int BATCH_SIZE = 50;
    /** 用户播放后多久内禁止抢 CPU（与 ThumbnailWarmer 一致）。 */
    private static final long PLAYBACK_QUIET_MS = 15_000;
    /** 在播放热区里轮询间隔。 */
    private static final long PLAYBACK_POLL_MS = 2_000;
    /** error_msg 列硬限制，防 ffprobe 出错堆栈塞爆表。 */
    private static final int ERROR_MSG_MAX = 500;

    private final VideoProcessingJobService jobService;
    private final VideoTableRepository videoRepo;
    private final FfmpegProbe ffprobe;
    private final ActivePlaybackTracker playback;

    public VideoDurationProbeService(VideoProcessingJobService jobService,
                                      VideoTableRepository videoRepo,
                                      FfmpegProbe ffprobe,
                                      ActivePlaybackTracker playback) {
        this.jobService = jobService;
        this.videoRepo = videoRepo;
        this.ffprobe = ffprobe;
        this.playback = playback;
    }

    public Optional<String> start() {
        return jobService.startJob(ProcessingJobType.DURATION_PROBE, this::workerLoop);
    }

    public void stop() {
        jobService.cancelJob(ProcessingJobType.DURATION_PROBE);
    }

    private void workerLoop(VideoProcessingJobService.JobContext ctx) {
        long total = videoRepo.countNeedingDuration();
        jobService.setTotal(ctx, total);
        while (!ctx.cancelled().get()) {
            // partial index 让每次都从"未处理"集合的头开始；处理完一行就自动从索引剔除，
            // 所以始终用 offset=0 即可（不会重复抓到同一行）。
            List<VideoRow> batch = videoRepo.findNeedingDuration(BATCH_SIZE, 0);
            if (batch.isEmpty()) break;
            for (VideoRow v : batch) {
                if (ctx.cancelled().get()) break;
                waitForPlaybackQuiet();
                probeOne(ctx, v);
            }
        }
    }

    private void probeOne(VideoProcessingJobService.JobContext ctx, VideoRow v) {
        Path src = Path.of(v.path());
        if (!Files.isRegularFile(src)) {
            // 文件已被删/移走：写明确 unknown，避免下次再扫到。
            videoRepo.updateDuration(v.path(), null, DurationBucket.UNKNOWN.label());
            jobService.recordFailure(ctx, v.path(), "file_not_found");
            return;
        }
        try {
            ProbeResult r = ffprobe.probe(src);
            double s = r.durationSeconds();
            if (s <= 0) {
                videoRepo.updateDuration(v.path(), null, DurationBucket.UNKNOWN.label());
                jobService.recordFailure(ctx, v.path(), "probe_no_duration");
                return;
            }
            DurationBucket bucket = DurationBucket.fromSeconds(s);
            videoRepo.updateDuration(v.path(), s, bucket.label());
            jobService.recordSuccess(ctx, v.path());
        } catch (Exception e) {
            // 损坏文件 / ffprobe timeout / 解码异常：写 unknown 不再重跑。
            videoRepo.updateDuration(v.path(), null, DurationBucket.UNKNOWN.label());
            jobService.recordFailure(ctx, v.path(), summarize(e));
            log.debug("duration probe failed for {}", v.path(), e);
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
