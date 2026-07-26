package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProbe;
import com.exceptioncoder.toolbox.common.media.FfmpegProcessRegistry;
import com.exceptioncoder.toolbox.common.media.ProbeResult;
import com.exceptioncoder.toolbox.treesize.config.WhisperProperties;
import com.exceptioncoder.toolbox.treesize.domain.DetectedLanguage;
import com.exceptioncoder.toolbox.treesize.domain.ProcessingJobType;
import com.exceptioncoder.toolbox.treesize.domain.VideoRow;
import com.exceptioncoder.toolbox.treesize.repository.VideoTableRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * 视频语言识别任务：按 size DESC 扫 {@code language IS NULL} 的视频，
 * ffmpeg 抽 25% 时间点起 60s 的 16kHz 单声道 WAV，按 {@code toolbox.whisper.mode} 交给
 * {@link WhisperRunner#detectLanguage}（cli，{@code --detect-language}）或
 * {@link WhisperAsrClient#detectLanguage}（asr-service，{@code POST /detect}）拿
 * ISO 码 + 置信度，回写
 * {@code treesize_video.language / language_confidence / language_detected_at}。
 *
 * <p>Whisper 单实例 GPU 串行最稳，本任务由 {@link VideoProcessingJobService} 起单 virtual thread，
 * 同 {@link ActivePlaybackTracker#recentlyActive(long)} 礼让用户播放——和
 * {@link VideoDurationProbeService} / {@code ThumbnailWarmer} 同节奏，避免抢 GPU/CPU。
 *
 * <p>致命错误（Whisper 二进制 / 模型缺失）—— start() 直接抛 IllegalStateException 让
 * controller 返 503，不开跑任务。单视频失败（坏文件 / whisper 单次异常）—— 记 failed 继续。
 */
@Service
public class VideoLanguageDetectionService {

    private static final Logger log = LoggerFactory.getLogger(VideoLanguageDetectionService.class);

    /** 抽样起点：视频 25% 位置避开片头曲 / opening。 */
    private static final double SAMPLE_START_PERCENT = 0.25;
    /** 抽样长度：60 秒给 whisper 足够语音内容判语言。 */
    private static final double SAMPLE_DURATION_S = 60.0;
    /** 太短判 too_short 直接跳过，不抽 wav。 */
    private static final double MIN_VIDEO_DURATION_S = 5.0;
    /** 每批拉 50 行；whisper 单视频 1-3s，50 视频 ≈ 1-2 分钟，进度刷新顺畅。 */
    private static final int BATCH_SIZE = 50;
    /** 用户播放后多久内不抢 GPU。 */
    private static final long PLAYBACK_QUIET_MS = 15_000;
    /** 等待播放空闲时的轮询间隔。 */
    private static final long PLAYBACK_POLL_MS = 2_000;
    /** error_msg 列硬限制。 */
    private static final int ERROR_MSG_MAX = 500;

    private final VideoProcessingJobService jobService;
    private final VideoTableRepository videoRepo;
    private final WhisperRunner whisper;
    private final WhisperAsrClient asr;
    private final WhisperProperties whisperProps;
    private final FfmpegProcessRegistry ffmpeg;
    private final FfmpegProbe ffprobe;
    private final ActivePlaybackTracker playback;
    private final Path tmpDir;

    public VideoLanguageDetectionService(VideoProcessingJobService jobService,
                                          VideoTableRepository videoRepo,
                                          WhisperRunner whisper,
                                          WhisperAsrClient asr,
                                          WhisperProperties whisperProps,
                                          FfmpegProcessRegistry ffmpeg,
                                          FfmpegProbe ffprobe,
                                          ActivePlaybackTracker playback) {
        this.jobService = jobService;
        this.videoRepo = videoRepo;
        this.whisper = whisper;
        this.asr = asr;
        this.whisperProps = whisperProps;
        this.ffmpeg = ffmpeg;
        this.ffprobe = ffprobe;
        this.playback = playback;
        this.tmpDir = Paths.get(System.getProperty("java.io.tmpdir"), "kai-toolbox", "lang-detect");
    }

    @PostConstruct
    void initTmpDir() throws IOException {
        Files.createDirectories(tmpDir);
        // 启动时清一次残留 wav（上次崩溃留下的）
        cleanupTmpDir();
    }

    /**
     * 语言识别当前为何不可用；{@link Optional#empty()} = 可用。
     *
     * <p>{@link #start()} 与 whisper capability 端点共用这一处判断，前端据此直接禁用按钮 +
     * 显示同一句原因。故意不让前端自己按 mode 推理：那等于把同一条规则写两遍，
     * 日后模式增减必然漂移成「按钮能点但后端拒」或反之。
     */
    public Optional<String> unavailableReason() {
        if (whisperProps.isAsrServiceMode()) {
            if (whisperProps.getServiceUrl().isBlank()) {
                return Optional.of("ASR 服务地址未配置：请设置 toolbox.whisper.service-url");
            }
            // 这里破例做一次网络探测（2s 超时）。配置齐不齐是确定的，进程活没活不是 ——
            // 而「模式钉在 asr-service 却没人启动 :9500」正是本模块踩过的坑，
            // 与其让用户点下去等一个连接失败，不如在按钮上就说清楚。
            if (asr.pingHealth() == null) {
                return Optional.of("ASR 服务未响应（" + whisperProps.getServiceUrl()
                        + "）：请先启动 python-services/faster-whisper/start.bat");
            }
            return Optional.empty();
        }
        if (!whisperProps.isAvailable()) {
            return Optional.of("whisper 未配置：请设置 toolbox.whisper.binary 与 model-path");
        }
        if (!Files.isRegularFile(Path.of(whisperProps.getBinary()))) {
            return Optional.of("whisper 可执行文件不存在：" + whisperProps.getBinary());
        }
        if (!Files.isRegularFile(Path.of(whisperProps.getModelPath()))) {
            return Optional.of("whisper 模型文件不存在：" + whisperProps.getModelPath());
        }
        return Optional.empty();
    }

    /**
     * 启动语言识别任务。前置不满足时抛 {@link IllegalStateException} 让 controller 返 503
     * ——不浪费一个 job 行。正常情况下前端按 capability 已把按钮禁掉，走不到这里。
     */
    public Optional<String> start() {
        Optional<String> blocked = unavailableReason();
        if (blocked.isPresent()) {
            throw new IllegalStateException(blocked.get());
        }
        return jobService.startJob(ProcessingJobType.LANGUAGE_DETECT, this::workerLoop);
    }

    public void stop() {
        jobService.cancelJob(ProcessingJobType.LANGUAGE_DETECT);
    }

    private void workerLoop(VideoProcessingJobService.JobContext ctx) {
        long total = videoRepo.countNeedingLanguageDetect();
        jobService.setTotal(ctx, total);
        try {
            while (!ctx.cancelled().get()) {
                // partial index 自动只返回未处理行，offset 始终 0
                List<VideoRow> batch = videoRepo.findNeedingLanguageDetect(BATCH_SIZE, 0);
                if (batch.isEmpty()) break;
                for (VideoRow v : batch) {
                    if (ctx.cancelled().get()) break;
                    waitForPlaybackQuiet();
                    detectOne(ctx, v);
                }
            }
        } finally {
            // 任务结束（含 cancelled / failed）统一再清一次临时目录
            cleanupTmpDir();
        }
    }

    private void detectOne(VideoProcessingJobService.JobContext ctx, VideoRow v) {
        Path src = Path.of(v.path());
        if (!Files.isRegularFile(src)) {
            log.info("skip language detect: file_not_found {}", v.path());
            recordLanguageFailure(ctx, v.path(), "file_not_found");
            return;
        }
        Path wav = null;
        try {
            // 先 ffprobe 一次拿元数据：duration + 是否有音轨。无音轨直接 no_audio_stream 跳过，
            // 避免后面 ffmpeg -vn 抽音轨时无流可写吐 AVERROR(EINVAL)（exit -22）。
            ProbeResult probe = ffprobe.probe(src);
            if ("(none)".equals(probe.audioCodec())) {
                log.info("skip language detect: no_audio_stream container={} videoCodec={} {}",
                        probe.container(), probe.videoCodec(), v.path());
                recordLanguageFailure(ctx, v.path(), "no_audio_stream");
                return;
            }
            double durationS = resolveDuration(v, src, probe);
            if (durationS < MIN_VIDEO_DURATION_S) {
                log.info("skip language detect: too_short duration={}s {}", durationS, v.path());
                recordLanguageFailure(ctx, v.path(), "too_short");
                return;
            }
            double startSec = Math.max(0, durationS * SAMPLE_START_PERCENT);
            double sampleDur = Math.min(SAMPLE_DURATION_S, Math.max(0.5, durationS - startSec));
            wav = tmpDir.resolve(UUID.randomUUID() + ".wav");
            ffmpeg.extractAudioSlice(src, startSec, sampleDur, wav);
            DetectedLanguage dl = detectByMode(wav, ctx);
            if (ctx.cancelled().get()) return;   // 被强杀的 whisper 结果不写库
            videoRepo.updateLanguage(v.path(), dl.iso(), dl.confidence(), System.currentTimeMillis());
            jobService.recordSuccess(ctx, v.path());
        } catch (InterruptedException ie) {
            // 取消信号：吞掉但不计 failure（cancelled 路径）
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            recordLanguageFailure(ctx, v.path(), summarize(e));
            log.debug("language detect failed for {}", v.path(), e);
        } finally {
            if (wav != null) {
                try { Files.deleteIfExists(wav); } catch (IOException ignored) {}
            }
        }
    }

    /**
     * 按 {@code toolbox.whisper.mode} 选后端。两条路径出参同为 {@link DetectedLanguage}
     * （ISO 码 + 置信度），上层不需要知道语言是子进程判的还是 HTTP 判的。
     *
     * <p>唯一的分叉点就这一处 —— 别在 detectOne 里按 mode 分支，那会让抽样、失败记账、
     * 临时文件清理这些与后端无关的逻辑跟着分裂成两份。
     */
    private DetectedLanguage detectByMode(Path wav, VideoProcessingJobService.JobContext ctx)
            throws IOException, InterruptedException {
        return whisperProps.isAsrServiceMode()
                ? asr.detectLanguage(wav, ctx.cancelled())
                : whisper.detectLanguage(wav, ctx.cancelled());
    }

    /**
     * 识别失败统一出口：先给视频行盖 language_detected_at 让它离开待识别队列（language 仍 NULL），
     * 再上报 job 失败计数。否则失败行永远满足 detected_at IS NULL，会被反复重识别（进度超量堆叠）。
     */
    private void recordLanguageFailure(VideoProcessingJobService.JobContext ctx, String path, String reason) {
        videoRepo.markLanguageAttempted(path, System.currentTimeMillis());
        jobService.recordFailure(ctx, path, reason);
    }

    private double resolveDuration(VideoRow v, Path src, ProbeResult probe) {
        // 视频表已有 duration_s 直接用；否则用调用方刚拿到的 probe 结果，不再多 fork 一次 ffprobe。
        if (v.durationS() != null && v.durationS() > 0) return v.durationS();
        return probe.durationSeconds();
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

    private void cleanupTmpDir() {
        if (!Files.isDirectory(tmpDir)) return;
        try (Stream<Path> s = Files.list(tmpDir)) {
            s.forEach(p -> { try { Files.deleteIfExists(p); } catch (IOException ignored) {} });
        } catch (IOException ignored) {
        }
    }

    private static String summarize(Throwable e) {
        String m = e.getClass().getSimpleName() + ": "
                + (e.getMessage() == null ? "" : e.getMessage());
        return m.length() > ERROR_MSG_MAX ? m.substring(0, ERROR_MSG_MAX) : m;
    }
}
