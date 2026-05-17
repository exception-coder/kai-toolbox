package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.treesize.config.WhisperProperties;
import com.exceptioncoder.toolbox.treesize.domain.AudioAnalysis;
import com.exceptioncoder.toolbox.treesize.domain.SubtitleJob;
import com.exceptioncoder.toolbox.treesize.domain.SubtitleStatus;
import com.exceptioncoder.toolbox.treesize.repository.SubtitleJobRepository;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * High-level subtitle generation orchestrator.
 *
 * <p>Pipeline per job:
 * <ol>
 *   <li>{@link AudioExtractor} pulls 16 kHz mono WAV from the video (status EXTRACTING_AUDIO).</li>
 *   <li>{@link WhisperRunner} transcribes WAV → VTT (status TRANSCRIBING). Progress and detected
 *       language are pushed live over SSE.</li>
 *   <li>WAV is deleted; status flips to COMPLETED with the VTT path persisted.</li>
 * </ol>
 *
 * <p>Concurrency is capped by {@link WhisperProperties#getMaxConcurrentJobs()} via a fixed
 * platform-thread pool — whisper is GPU-bound, running multiple in parallel only thrashes
 * the device. The cap is platform threads (not virtual) because the workload is "block on a
 * subprocess for minutes" and we want a hard ceiling, not an elastic one.
 *
 * <p>Idempotency: per video file (keyed by SHA-1 of absolute path) only one job exists at a
 * time. Re-requesting an in-flight job returns the existing record; re-requesting a completed
 * one returns the existing VTT until the caller explicitly deletes it.
 */
@Service
public class SubtitleService {

    private static final Logger log = LoggerFactory.getLogger(SubtitleService.class);

    private final SubtitleJobRepository jobs;
    private final AudioExtractor audio;
    private final AudioContentProbe audioProbe;
    private final WhisperRunner whisper;
    private final WhisperAsrClient whisperAsr;
    private final DeepLXTranslator translator;
    private final SseEmitterRegistry sse;
    private final TaskBroadcaster taskBroadcaster;
    private final TaskAssembler taskAssembler;
    private final WhisperProperties props;
    private final String dataDir;

    private final ExecutorService executor;
    private final ConcurrentHashMap<String, AtomicBoolean> cancelFlags = new ConcurrentHashMap<>();

    public SubtitleService(SubtitleJobRepository jobs,
                           AudioExtractor audio,
                           AudioContentProbe audioProbe,
                           WhisperRunner whisper,
                           WhisperAsrClient whisperAsr,
                           DeepLXTranslator translator,
                           SseEmitterRegistry sse,
                           TaskBroadcaster taskBroadcaster,
                           TaskAssembler taskAssembler,
                           WhisperProperties props,
                           @Value("${toolbox.data-dir}") String dataDir) {
        this.jobs = jobs;
        this.audio = audio;
        this.audioProbe = audioProbe;
        this.whisper = whisper;
        this.whisperAsr = whisperAsr;
        this.translator = translator;
        this.sse = sse;
        this.taskBroadcaster = taskBroadcaster;
        this.taskAssembler = taskAssembler;
        this.props = props;
        this.dataDir = dataDir;
        this.executor = Executors.newFixedThreadPool(
                props.getMaxConcurrentJobs(),
                r -> {
                    Thread t = new Thread(r, "subtitle-worker");
                    t.setDaemon(true);
                    return t;
                });
    }

    @PostConstruct
    void ensureOutputDir() throws IOException {
        Files.createDirectories(outputDir());
    }

    @PreDestroy
    void shutdown() {
        // Flip every cancel flag so workers stop their whisper subprocesses; the registry
        // shutdown hook will reap any survivors.
        cancelFlags.values().forEach(f -> f.set(true));
        executor.shutdown();
        try {
            if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            executor.shutdownNow();
        }
    }

    public boolean isWhisperAvailable() {
        return props.isAvailable();
    }

    /** VTT 文件最终落盘位置。默认 {@code ${toolbox.data-dir}/subtitles}。 */
    public Path outputDir() {
        return props.getOutputDir().isEmpty()
                ? Path.of(dataDir, "subtitles")
                : Path.of(props.getOutputDir());
    }

    /**
     * whisper.cpp 实际运行时的工作目录。whisper.cpp 在 Windows 上用 C++ 的 fopen / ofstream
     * 写文件，默认走 ANSI 编码 —— 当 outputDir 路径含非 ASCII 字符（如中文用户名 {@code 张凯}
     * 出现在 {@code C:\Users\张凯\.kai-toolbox\subtitles}）时，转写跑完会「悄无声息地」写不出
     * VTT 文件，对外表现是退出码 0 但 VTT 文件不存在。
     *
     * <p>规避方式：Windows + CJK 路径时让 whisper 写到 {@code %PROGRAMDATA%\kai-toolbox\whisper-out}
     * （纯 ASCII，所有用户都可写），转写完 Java 端再 {@link Files#move} 到 {@link #outputDir()}。
     * Java 文件 API 用 UTF-16 不受 ANSI codepage 限制。
     *
     * <p>非 Windows 或 outputDir 本身就 ASCII 时，直接返回 outputDir 不走 hack。
     */
    public Path whisperWorkDir() {
        if (!System.getProperty("os.name", "").toLowerCase().contains("windows")) {
            return outputDir();
        }
        String outStr = outputDir().toAbsolutePath().toString();
        if (isAscii(outStr)) {
            return outputDir();
        }
        // outputDir 含 CJK，走 PROGRAMDATA 兜底；这是 Windows 系统级共享目录，永远 ASCII。
        String programData = System.getenv("PROGRAMDATA");
        if (programData != null && !programData.isBlank() && isAscii(programData)) {
            return Path.of(programData, "kai-toolbox", "whisper-out");
        }
        // 罕见环境（PROGRAMDATA 未设置 / 被改成 CJK 路径），直接落盘到 C:\kai-toolbox-whisper。
        return Path.of("C:", "kai-toolbox-whisper");
    }

    /** 路径是否全部由 7-bit ASCII 字符组成。 */
    private static boolean isAscii(String s) {
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) > 127) return false;
        }
        return true;
    }

    public Optional<SubtitleJob> findById(String id) {
        return jobs.findById(id);
    }

    /** Used by the player UI to decide whether to surface "已生成" instead of "生成字幕". */
    public Optional<SubtitleJob> findByVideoPath(String videoPath) {
        return jobs.findByVideoPathHash(hash(videoPath));
    }

    /**
     * Submit a transcription job for {@code video}. If a job already exists for this video
     * (running, completed, or failed), the existing record is returned unchanged — call
     * {@link #delete} first to force regeneration. Throws {@code IllegalStateException} when
     * whisper is not configured.
     */
    /**
     * Submit a transcription job. {@code language} is the ISO 639-1 code passed to whisper
     * (e.g. {@code "ja"}, {@code "en"}); pass {@code "auto"} or {@code null} to let whisper
     * detect. Explicit language is strongly recommended for non-English content — without it
     * whisper often hallucinates English transcriptions for Japanese/Korean audio.
     *
     * <p>{@code initialPrompt} is the user-supplied {@code --prompt} seed (proper nouns /
     * domain vocabulary); pass {@code null} or blank to use only the global default from
     * {@link WhisperProperties#getDefaultInitialPrompt()}.
     */
    public SubtitleJob enqueue(String scanId, Path video, String language, String initialPrompt) {
        if (!isWhisperAvailable()) {
            throw new IllegalStateException(
                    "Whisper 未配置：请在 application.yml 设置 toolbox.whisper.binary 与 model-path");
        }
        String videoPathStr = video.toAbsolutePath().toString();
        String pathHash = hash(videoPathStr);

        Optional<SubtitleJob> existing = jobs.findByVideoPathHash(pathHash);
        if (existing.isPresent()) {
            return existing.get();
        }

        String normLang = (language == null || language.isBlank() || "auto".equalsIgnoreCase(language))
                ? null : language.trim().toLowerCase();
        String normPrompt = (initialPrompt == null || initialPrompt.isBlank()) ? null : initialPrompt.trim();

        SubtitleJob job = SubtitleJob.builder()
                .id(UUID.randomUUID().toString())
                .scanId(scanId)
                .videoPath(videoPathStr)
                .videoPathHash(pathHash)
                .status(SubtitleStatus.PENDING)
                .model(props.getModelName())
                // Pre-populate language when explicitly specified so the UI shows it immediately.
                .sourceLanguage(normLang)
                .initialPrompt(normPrompt)
                .progress(0.0)
                .createdAt(System.currentTimeMillis())
                .build();
        jobs.insert(job);
        // 任务中心：作业刚入队就广播一次,前端列表能立即看到 PENDING 行,无需等第一个 worker 事件。
        broadcastTask(job);

        AtomicBoolean cancelled = new AtomicBoolean(false);
        cancelFlags.put(job.getId(), cancelled);
        String whisperLang = normLang != null ? normLang : "auto";
        executor.submit(() -> runJob(job, video, whisperLang, normPrompt, cancelled));
        return job;
    }

    /**
     * Cancel a running job. No-op for jobs already in a terminal state.
     */
    public void cancel(String jobId) {
        AtomicBoolean flag = cancelFlags.get(jobId);
        if (flag != null) flag.set(true);
    }

    /**
     * Hard-delete the job row + its VTT file. Used when the user wants to regenerate
     * subtitles or remove them entirely. Returns {@code true} if a job existed and was removed.
     */
    /**
     * Translate an already-completed subtitle job. No-op if translation already exists or
     * the job is not yet COMPLETED. Runs synchronously on the caller's thread (call from a
     * virtual thread or async context to avoid blocking).
     */
    public boolean translateExisting(String jobId) {
        SubtitleJob job = jobs.findById(jobId).orElse(null);
        if (job == null || job.getStatus() != SubtitleStatus.COMPLETED || job.getVttPath() == null) {
            return false;
        }
        if (job.getTranslatedVttPath() != null) return true; // already done
        String lang = job.getSourceLanguage();
        if (!translator.isEnabled() || !translator.shouldTranslate(lang)) return false;
        try {
            Path vtt = Path.of(job.getVttPath());
            boolean ok = runTranslationPhase(job, vtt, lang);
            // 回到 COMPLETED(translateExisting 入口本来就是 COMPLETED → TRANSLATING → COMPLETED 一圈)
            job.setStatus(SubtitleStatus.COMPLETED);
            job.setProgress(1.0);
            jobs.updateStatus(jobId, SubtitleStatus.COMPLETED, null, null, null);
            jobs.updateProgress(jobId, 1.0);
            publish(jobId, "completed", statusEvent(job));
            broadcastTask(job);
            return ok;
        } catch (Exception e) {
            log.warn("translateExisting failed for job {}: {}", jobId, e.getMessage());
            // 失败也要回 COMPLETED,前端不能卡在 TRANSLATING
            job.setStatus(SubtitleStatus.COMPLETED);
            job.setProgress(1.0);
            try {
                jobs.updateStatus(jobId, SubtitleStatus.COMPLETED, null, null, null);
                jobs.updateProgress(jobId, 1.0);
                publish(jobId, "completed", statusEvent(job));
                broadcastTask(job);
            } catch (Exception ignored) { /* publish 失败无害,SSE 客户端会通过下次轮询拿到状态 */ }
            return false;
        }
    }

    /**
     * 跑 DeepLX/Ollama 翻译,把 job 状态切到 TRANSLATING 并通过 SSE 持续发 progress。
     * 调用方负责在前后切 COMPLETED 状态;本方法只管 TRANSLATING 这段生命周期。
     *
     * @return true 表示翻译产出了 .zh.vtt 文件;false 表示翻译被跳过或失败(原字幕仍可用)
     */
    private boolean runTranslationPhase(SubtitleJob job, Path vtt, String sourceLang) {
        String jobId = job.getId();
        job.setStatus(SubtitleStatus.TRANSLATING);
        job.setProgress(0.0);
        jobs.updateStatus(jobId, SubtitleStatus.TRANSLATING, null, null, null);
        jobs.updateProgress(jobId, 0.0);
        publish(jobId, "status", statusEvent(job));
        broadcastTask(job);

        try {
            Path translatedVtt = translator.translateVtt(vtt, sourceLang, p -> {
                // p 是 0..1,这里 round 后再除回去,避免 progress 字段在 SSE 帧间随机抖动
                int pct = (int) Math.round(p * 100);
                pct = Math.max(0, Math.min(100, pct));
                double progress = pct / 100.0;
                job.setProgress(progress);
                jobs.updateProgress(jobId, progress);
                publish(jobId, "progress", Map.of("progress", progress, "percent", pct));
                broadcastTask(job);
            });
            if (translatedVtt != null) {
                job.setTranslatedVttPath(translatedVtt.toAbsolutePath().toString());
                jobs.updateTranslatedVttPath(jobId, job.getTranslatedVttPath());
                publish(jobId, "translated", Map.of("hasTranslatedVtt", true));
                return true;
            }
            return false;
        } catch (Exception e) {
            // 翻译失败是非致命的:原字幕已经在 vttPath,前端继续可用。这里 warn 不 throw。
            log.warn("DeepLX translation failed for job {}: {}", jobId, e.getMessage());
            return false;
        }
    }

    public boolean delete(String jobId) {
        Optional<SubtitleJob> job = jobs.findById(jobId);
        if (job.isEmpty()) return false;
        cancel(jobId);
        // Wait briefly for the worker to notice cancellation before yanking files.
        try {
            Thread.sleep(50);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        if (job.get().getVttPath() != null) {
            try {
                Files.deleteIfExists(Path.of(job.get().getVttPath()));
            } catch (IOException e) {
                log.warn("failed to delete VTT for job {}: {}", jobId, e.toString());
            }
        }
        jobs.deleteById(jobId);
        return true;
    }

    /** WhisperRunner.run 和 WhisperAsrClient.run 的共同函数签名，供 method reference 用。 */
    @FunctionalInterface
    private interface WhisperJobRunner {
        Path run(Path wav, Path outputPrefix, String language, String initialPrompt,
                 WhisperRunner.ProgressListener listener, AtomicBoolean cancelled)
                throws IOException, InterruptedException;
    }

    private void runJob(SubtitleJob job, Path video, String language, String initialPrompt, AtomicBoolean cancelled) {
        // whisper 必须跑在 ASCII 安全的工作目录（Windows + CJK 路径时是 %PROGRAMDATA% 兜底，
        // 见 whisperWorkDir() Javadoc）。跑完 Java 端再 move 到最终 outputDir。
        Path workDir = whisperWorkDir();
        Path tmpWav = workDir.resolve(".tmp-" + job.getVideoPathHash() + "-" + job.getId() + ".wav");
        Path outputPrefix = workDir.resolve(job.getVideoPathHash());
        Path finalVtt = outputDir().resolve(job.getVideoPathHash() + ".vtt");
        try {
            Files.createDirectories(workDir);
            Files.createDirectories(outputDir());
        } catch (IOException e) {
            log.error("创建字幕工作目录失败 work={} final={}: {}", workDir, outputDir(), e.toString());
        }

        long startedAt = System.currentTimeMillis();
        // 第一步：音频内容预检。先把 job 标成 ANALYZING_AUDIO，前端立即看到状态进展；
        // 跑完拿到 verdict，再决定走 EXTRACTING_AUDIO（继续）还是直接 FAILED（提前止损）。
        job.setStatus(SubtitleStatus.ANALYZING_AUDIO);
        job.setStartedAt(startedAt);
        jobs.updateStatus(job.getId(), job.getStatus(), startedAt, null, null);
        publish(job.getId(), "status", statusEvent(job));
        broadcastTask(job);

        // 长视频全文件分析可能要几十秒到几分钟。把 ffmpeg 解析出来的百分比转成 0.0~1.0 写
        // 到 job.progress，让前端进度条在这阶段也能"动起来"（之前是不确定 spinner）。
        AudioAnalysis analysis = audioProbe.analyze(video, percent -> {
            double p = Math.max(0, Math.min(99, percent)) / 100.0;
            job.setProgress(p);
            jobs.updateProgress(job.getId(), p);
            publish(job.getId(), "progress", Map.of("progress", p, "percent", percent));
            broadcastTask(job);
        });
        publish(job.getId(), "analysis", Map.of(
                "verdict", analysis.verdict().name(),
                "reason", analysis.reason(),
                "summary", analysis.summary(),
                "meanVolumeDb", analysis.meanVolumeDb(),
                "maxVolumeDb", analysis.maxVolumeDb(),
                "silenceRatio", analysis.silenceRatio(),
                "hasAudioStream", analysis.hasAudioStream()
        ));
        // 预检完毕，把 progress 归零让接下来的 TRANSCRIBING 阶段从 0% 重新计。
        job.setProgress(0.0);
        jobs.updateProgress(job.getId(), 0.0);
        if (analysis.verdict() == AudioAnalysis.Verdict.NO_AUDIO_STREAM
                || analysis.verdict() == AudioAnalysis.Verdict.UNLIKELY) {
            // 提前失败：把摘要写进 errorMsg，前端 SubtitleControls 会原样展示。
            // 这条路径不浪费 GPU，也不会留孤儿 .wav / .vtt。
            long finishedAt = System.currentTimeMillis();
            job.setStatus(SubtitleStatus.FAILED);
            job.setFinishedAt(finishedAt);
            job.setErrorMsg(analysis.summary());
            jobs.updateStatus(job.getId(), job.getStatus(), null, finishedAt, analysis.summary());
            publish(job.getId(), "error", Map.of("message", analysis.summary()));
            broadcastTask(job);
            cancelFlags.remove(job.getId());
            sse.complete(job.getId());
            log.info("subtitle job {} 提前失败：{}", job.getId(), analysis.summary());
            return;
        }
        if (analysis.verdict() == AudioAnalysis.Verdict.SPARSE) {
            log.warn("subtitle job {} 音频稀疏，仍尝试转写：{}", job.getId(), analysis.summary());
        }

        // 第二步：实际抽取音频 + 跑 whisper。
        job.setStatus(SubtitleStatus.EXTRACTING_AUDIO);
        jobs.updateStatus(job.getId(), job.getStatus(), null, null, null);
        publish(job.getId(), "status", statusEvent(job));
        broadcastTask(job);

        try {
            audio.extract(video, tmpWav);
            if (cancelled.get()) {
                throw new InterruptedException("cancelled before transcription");
            }

            job.setStatus(SubtitleStatus.TRANSCRIBING);
            jobs.updateStatus(job.getId(), job.getStatus(), null, null, null);
            publish(job.getId(), "status", statusEvent(job));
            broadcastTask(job);

            // 根据 mode 选转写后端：CLI 走 whisper.cpp 子进程；asr-service 走本地 HTTP 服务。
            // 两个实现的方法签名完全对齐（同样的 ProgressListener / cancelled 语义），切换无感知。
            WhisperJobRunner runner = props.isAsrServiceMode()
                    ? whisperAsr::run
                    : whisper::run;
            Path vttInWorkDir = runner.run(tmpWav, outputPrefix, language, initialPrompt, new WhisperRunner.ProgressListener() {
                @Override
                public void onProgress(int percent) {
                    double p = percent / 100.0;
                    job.setProgress(p);
                    jobs.updateProgress(job.getId(), p);
                    publish(job.getId(), "progress", Map.of("progress", p, "percent", percent));
                    broadcastTask(job);
                }

                @Override
                public void onLanguageDetected(String iso) {
                    job.setSourceLanguage(iso);
                    jobs.updateLanguage(job.getId(), iso);
                    publish(job.getId(), "language", Map.of("language", iso));
                    broadcastTask(job);
                }
            }, cancelled);

            // 把 whisper 写出的 VTT 从 ASCII 工作目录 move 到最终目录（两者相同时是 no-op）。
            // 用 Java 的 Files.move（UTF-16 文件 API），不受 ANSI codepage 限制；REPLACE_EXISTING
            // 让重新生成的字幕能正确覆盖旧文件。不传 ATOMIC_MOVE —— 跨盘 move 时 Java 会自动
            // 退化到 copy + delete，传 ATOMIC_MOVE 反而会抛 AtomicMoveNotSupportedException。
            Path vtt;
            if (!vttInWorkDir.toAbsolutePath().equals(finalVtt.toAbsolutePath())) {
                Files.move(vttInWorkDir, finalVtt, StandardCopyOption.REPLACE_EXISTING);
                vtt = finalVtt;
            } else {
                vtt = vttInWorkDir;
            }

            // 转写完成:hasVtt 信息先落 DB(vttPath 在 statusEvent payload 里下发,前端拿到就能挂
            // <track>),但 status 暂不切到 COMPLETED,先看是否需要翻译。
            //  - 需要翻译 → 进 TRANSLATING 阶段,翻译完成才切 COMPLETED
            //  - 不需要翻译 → 直接 COMPLETED
            // 这样 SSE 不会在翻译期被前端断开(COMPLETED 不在 ACTIVE_STATUSES 里)。
            job.setProgress(1.0);
            job.setVttPath(vtt.toAbsolutePath().toString());
            jobs.updateProgress(job.getId(), 1.0);
            jobs.updateVttPath(job.getId(), job.getVttPath());

            String detectedLang = job.getSourceLanguage();
            boolean needTranslate = translator.isEnabled() && translator.shouldTranslate(detectedLang);

            if (needTranslate) {
                runTranslationPhase(job, vtt, detectedLang);
            }

            long finishedAt = System.currentTimeMillis();
            job.setStatus(SubtitleStatus.COMPLETED);
            job.setProgress(1.0);
            job.setFinishedAt(finishedAt);
            jobs.updateProgress(job.getId(), 1.0);
            jobs.updateStatus(job.getId(), job.getStatus(), null, finishedAt, null);
            publish(job.getId(), "completed", statusEvent(job));
            broadcastTask(job);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            long finishedAt = System.currentTimeMillis();
            job.setStatus(SubtitleStatus.CANCELLED);
            job.setFinishedAt(finishedAt);
            jobs.updateStatus(job.getId(), job.getStatus(), null, finishedAt, null);
            publish(job.getId(), "cancelled", statusEvent(job));
            broadcastTask(job);
        } catch (Exception e) {
            log.error("subtitle job {} failed for {}", job.getId(), video, e);
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            long finishedAt = System.currentTimeMillis();
            job.setStatus(SubtitleStatus.FAILED);
            job.setFinishedAt(finishedAt);
            job.setErrorMsg(msg);
            jobs.updateStatus(job.getId(), job.getStatus(), null, finishedAt, msg);
            publish(job.getId(), "error", Map.of("message", msg));
            broadcastTask(job);
        } finally {
            try {
                Files.deleteIfExists(tmpWav);
            } catch (IOException e) {
                log.warn("failed to delete temp wav {}: {}", tmpWav, e.toString());
            }
            cancelFlags.remove(job.getId());
            sse.complete(job.getId());
        }
    }

    private void publish(String jobId, String eventName, Object payload) {
        sse.publish(jobId, eventName, payload);
    }

    /**
     * 任务中心专用广播：把当前 job 当前状态以 TaskView 形式发到全局多订阅频道。
     * 字幕作业的状态变更点都顺手调一次,前端任务中心列表就能实时刷新。
     * 与每作业 SSE 频道并行存在,不互相替代。
     */
    private void broadcastTask(SubtitleJob job) {
        taskBroadcaster.broadcast(taskAssembler.from(job));
    }

    private static Map<String, Object> statusEvent(SubtitleJob j) {
        return Map.of(
                "id", j.getId(),
                "status", j.getStatus().name(),
                "progress", j.getProgress(),
                "sourceLanguage", j.getSourceLanguage() == null ? "" : j.getSourceLanguage(),
                "vttPath", j.getVttPath() == null ? "" : j.getVttPath(),
                "errorMsg", j.getErrorMsg() == null ? "" : j.getErrorMsg()
        );
    }

    /**
     * SHA-1 of the absolute video path. Used as both the row's {@code video_path_hash} and
     * the VTT filename — same input always produces the same VTT location, so re-running
     * over an existing job overwrites in-place rather than orphaning files.
     */
    static String hash(String absolutePath) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] digest = md.digest(absolutePath.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            // SHA-1 ships with every JVM; this branch is unreachable.
            throw new IllegalStateException("SHA-1 not available", e);
        }
    }
}
