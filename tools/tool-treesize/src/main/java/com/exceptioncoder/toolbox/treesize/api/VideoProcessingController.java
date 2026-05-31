package com.exceptioncoder.toolbox.treesize.api;

import com.exceptioncoder.toolbox.treesize.api.dto.VideoMergeRequest;
import com.exceptioncoder.toolbox.treesize.api.dto.VideoSyncResult;
import com.exceptioncoder.toolbox.treesize.domain.ProcessingJob;
import com.exceptioncoder.toolbox.treesize.domain.ProcessingJobType;
import com.exceptioncoder.toolbox.treesize.domain.VideoRow;
import com.exceptioncoder.toolbox.treesize.repository.VideoTableRepository;
import com.exceptioncoder.toolbox.treesize.service.VideoDurationProbeService;
import com.exceptioncoder.toolbox.treesize.service.VideoLanguageDetectionService;
import com.exceptioncoder.toolbox.treesize.service.VideoNameGroupingService;
import com.exceptioncoder.toolbox.treesize.service.VideoProcessingJobService;
import com.exceptioncoder.toolbox.treesize.service.VideoMergeService;
import com.exceptioncoder.toolbox.treesize.service.VideoSyncService;
import com.exceptioncoder.toolbox.treesize.service.VideoThumbnailGridService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.NoSuchFileException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 视频处理任务相关端点 —— 已落地 5 类任务（sync / duration-probe / name-grouping /
 * language-detect / thumbnail-grid），下期接入 person-age / visual-embed / visual-cluster
 * 时按本控制器同模板继续追加（每类 4 个端点：start / stop / status / events；
 * thumbnail-grid 额外暴露一个 GET 取图端点）。
 *
 * <p>独立于 {@link TreeSizeController} 是因为后者已接近 700 行 + 30 个构造参数;
 * 把任务调度类端点拆到本控制器，统一走 {@link VideoProcessingJobService} 抽象，
 * 让 controller 体量可控、依赖收敛在 4 个 service 上。
 *
 * <p>路径前缀保持 {@code /api/treesize/videos/...}，前端感知不到 controller 切分。
 */
@RestController
@RequestMapping("/api/treesize/videos")
public class VideoProcessingController {

    private final VideoSyncService syncService;
    private final VideoDurationProbeService durationService;
    private final VideoNameGroupingService nameGroupingService;
    private final VideoLanguageDetectionService languageService;
    private final VideoThumbnailGridService gridService;
    private final VideoMergeService mergeService;
    private final VideoProcessingJobService jobService;
    private final VideoTableRepository videoRepo;

    public VideoProcessingController(VideoSyncService syncService,
                                      VideoDurationProbeService durationService,
                                      VideoNameGroupingService nameGroupingService,
                                      VideoLanguageDetectionService languageService,
                                      VideoThumbnailGridService gridService,
                                      VideoMergeService mergeService,
                                      VideoProcessingJobService jobService,
                                      VideoTableRepository videoRepo) {
        this.syncService = syncService;
        this.durationService = durationService;
        this.nameGroupingService = nameGroupingService;
        this.languageService = languageService;
        this.gridService = gridService;
        this.mergeService = mergeService;
        this.jobService = jobService;
        this.videoRepo = videoRepo;
    }

    // ==============================================================================
    // 同步入口：从 treesize_node 把视频汇总到 treesize_video（INSERT OR IGNORE，只增不改）
    // 同步阻塞返回；万级视频量级 < 1s，无需 SSE。
    // ==============================================================================

    @PostMapping("/sync")
    public VideoSyncResult syncVideos() {
        return syncService.sync();
    }

    // ==============================================================================
    // 视频合并：把多选的 N 个视频按顺序拼成一个 mp4。同步阻塞返回；非法入参 → 400，
    // ffmpeg 失败 → 500（走全局异常处理）。
    // ==============================================================================

    @PostMapping("/merge")
    public ResponseEntity<?> mergeVideos(@RequestBody VideoMergeRequest req) {
        try {
            return ResponseEntity.ok(mergeService.merge(req));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    // ==============================================================================
    // 时长区间分类（ffprobe → duration_s + duration_bucket）
    // ==============================================================================

    @PostMapping("/duration-probe/start")
    public ResponseEntity<?> startDurationProbe() {
        return startTask(ProcessingJobType.DURATION_PROBE, durationService::start);
    }

    @PostMapping("/duration-probe/stop")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void stopDurationProbe() {
        durationService.stop();
    }

    @GetMapping("/duration-probe/status")
    public ProcessingJob getDurationProbeStatus() {
        return jobService.getLatest(ProcessingJobType.DURATION_PROBE).orElse(null);
    }

    @GetMapping(value = "/duration-probe/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter durationProbeEvents() {
        return jobService.subscribe(ProcessingJobType.DURATION_PROBE);
    }

    // ==============================================================================
    // 名称归类（纯正则去噪 → series_signature + series_episode）
    // ==============================================================================

    @PostMapping("/name-grouping/start")
    public ResponseEntity<?> startNameGrouping() {
        return startTask(ProcessingJobType.NAME_GROUPING, nameGroupingService::start);
    }

    @PostMapping("/name-grouping/stop")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void stopNameGrouping() {
        nameGroupingService.stop();
    }

    @GetMapping("/name-grouping/status")
    public ProcessingJob getNameGroupingStatus() {
        return jobService.getLatest(ProcessingJobType.NAME_GROUPING).orElse(null);
    }

    @GetMapping(value = "/name-grouping/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter nameGroupingEvents() {
        return jobService.subscribe(ProcessingJobType.NAME_GROUPING);
    }

    // ==============================================================================
    // 视频语言识别（whisper-cli --detect-language → language + confidence）
    // ==============================================================================

    @PostMapping("/language-detect/start")
    public ResponseEntity<?> startLanguageDetect() {
        return startTask(ProcessingJobType.LANGUAGE_DETECT, languageService::start);
    }

    @PostMapping("/language-detect/stop")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void stopLanguageDetect() {
        languageService.stop();
    }

    @GetMapping("/language-detect/status")
    public ProcessingJob getLanguageDetectStatus() {
        return jobService.getLatest(ProcessingJobType.LANGUAGE_DETECT).orElse(null);
    }

    @GetMapping(value = "/language-detect/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter languageDetectEvents() {
        return jobService.subscribe(ProcessingJobType.LANGUAGE_DETECT);
    }

    // ==============================================================================
    // 视频九宫格预览图（ffmpeg tile=3x3 → thumbnail_grid_path）
    // ==============================================================================

    @PostMapping("/thumbnail-grid/start")
    public ResponseEntity<?> startThumbnailGrid() {
        return startTask(ProcessingJobType.THUMBNAIL_GRID, gridService::start);
    }

    @PostMapping("/thumbnail-grid/stop")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void stopThumbnailGrid() {
        gridService.stop();
    }

    @GetMapping("/thumbnail-grid/status")
    public ProcessingJob getThumbnailGridStatus() {
        return jobService.getLatest(ProcessingJobType.THUMBNAIL_GRID).orElse(null);
    }

    @GetMapping(value = "/thumbnail-grid/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter thumbnailGridEvents() {
        return jobService.subscribe(ProcessingJobType.THUMBNAIL_GRID);
    }

    /**
     * 取视频的九宫格 JPEG。前端 {@code <img src>} 直接拼路径调用，配合 1 天 Cache-Control。
     * 路径未生成 / 缓存被删 → 404；前端用占位图兜底。
     */
    @GetMapping(value = "/thumbnail-grid", produces = MediaType.IMAGE_JPEG_VALUE)
    public ResponseEntity<StreamingResponseBody> getThumbnailGrid(@RequestParam String path) {
        try {
            InputStream in = gridService.openGridStream(path);
            StreamingResponseBody body = out -> {
                try (in) { in.transferTo(out); }
            };
            return ResponseEntity.ok()
                    .cacheControl(CacheControl.maxAge(Duration.ofDays(1)))
                    .body(body);
        } catch (NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * 按系列签名查同系列所有视频。前端在视频详情/列表里展示"同系列(N)"链接时调用。
     * 排序：先按 {@code series_episode} 升序（NULL 排末尾），再按 {@code name COLLATE NOCASE}。
     */
    @GetMapping("/series/{signature}")
    public ResponseEntity<?> getSeries(@PathVariable String signature) {
        List<VideoRow> rows = videoRepo.findBySeriesSignature(signature);
        if (rows.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(Map.of(
                "signature", signature,
                "count", rows.size(),
                "items", rows
        ));
    }

    // ==============================================================================
    // 通用：start 任务壳。已有 RUNNING 同类型任务时返回 409 + 当前 jobId，方便前端跳过启动。
    // ==============================================================================

    private ResponseEntity<?> startTask(ProcessingJobType type, java.util.function.Supplier<Optional<String>> starter) {
        Optional<String> jobId;
        try {
            jobId = starter.get();
        } catch (IllegalStateException e) {
            // 比如 ai-vision 未启动这类前置检查失败
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("message", e.getMessage()));
        }
        if (jobId.isEmpty()) {
            ProcessingJob running = jobService.getRunning(type)
                    .or(() -> jobService.getLatest(type))
                    .orElse(null);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of(
                            "message", "task already running",
                            "jobId", running == null ? null : running.id(),
                            "total", running == null ? 0L : running.total()));
        }
        ProcessingJob view = jobService.getLatest(type).orElse(null);
        return ResponseEntity.ok(Map.of(
                "jobId", jobId.get(),
                "total", view == null ? 0L : view.total()
        ));
    }
}
