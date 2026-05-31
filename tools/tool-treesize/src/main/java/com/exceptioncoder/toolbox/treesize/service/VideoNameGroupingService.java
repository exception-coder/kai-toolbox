package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.ProcessingJobType;
import com.exceptioncoder.toolbox.treesize.domain.VideoRow;
import com.exceptioncoder.toolbox.treesize.repository.VideoTableRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * 视频名称归类任务：按 size DESC 扫 {@code series_signature IS NULL} 的视频，
 * 调 {@link NameNormalizer#normalize} 算出系列签名 + 集数，整体写回 {@code treesize_video}。
 *
 * <p>纯字符串处理，<b>无外部 AI 依赖</b>，性能极快（单视频 < 1ms）。所以 batch 拉得大（200），
 * 也不需要 ffprobe / GPU；保留礼让 ActivePlaybackTracker 只是为了和其他子任务统一节奏。
 *
 * <p>失败容错：单视频 normalize 抛异常（理论上不应该，NameNormalizer 全 catch 了非法正则）
 * → 写入失败计数 + errorMsg，继续下一个。
 */
@Service
public class VideoNameGroupingService {

    private static final Logger log = LoggerFactory.getLogger(VideoNameGroupingService.class);

    private static final int BATCH_SIZE = 200;
    private static final int ERROR_MSG_MAX = 500;

    private final VideoProcessingJobService jobService;
    private final VideoTableRepository videoRepo;
    private final NameNormalizer normalizer;

    public VideoNameGroupingService(VideoProcessingJobService jobService,
                                     VideoTableRepository videoRepo,
                                     NameNormalizer normalizer) {
        this.jobService = jobService;
        this.videoRepo = videoRepo;
        this.normalizer = normalizer;
    }

    public Optional<String> start() {
        return jobService.startJob(ProcessingJobType.NAME_GROUPING, this::workerLoop);
    }

    public void stop() {
        jobService.cancelJob(ProcessingJobType.NAME_GROUPING);
    }

    private void workerLoop(VideoProcessingJobService.JobContext ctx) {
        long total = videoRepo.countNeedingNameGrouping();
        jobService.setTotal(ctx, total);
        while (!ctx.cancelled().get()) {
            List<VideoRow> batch = videoRepo.findNeedingNameGrouping(BATCH_SIZE, 0);
            if (batch.isEmpty()) break;
            for (VideoRow v : batch) {
                if (ctx.cancelled().get()) break;
                try {
                    NameNormalizer.NormalizedName n = normalizer.normalize(v.name());
                    videoRepo.updateSeries(v.path(), n.signature(), n.episode());
                    jobService.recordSuccess(ctx, v.path());
                } catch (Exception e) {
                    // 失败也写哨兵签名让行出队（series_signature 非 NULL），否则失败行反复重归类。
                    // NameNormalizer 理论上不抛异常，这里是极端兜底。
                    videoRepo.updateSeries(v.path(), "__ungrouped__", null);
                    jobService.recordFailure(ctx, v.path(), summarize(e));
                    log.debug("name grouping failed for {}", v.path(), e);
                }
            }
        }
    }

    private static String summarize(Throwable e) {
        String m = e.getClass().getSimpleName() + ": "
                + (e.getMessage() == null ? "" : e.getMessage());
        return m.length() > ERROR_MSG_MAX ? m.substring(0, ERROR_MSG_MAX) : m;
    }
}
