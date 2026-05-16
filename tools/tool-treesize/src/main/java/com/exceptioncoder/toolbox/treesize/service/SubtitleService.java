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
    private final DeepLXTranslator translator;
    private final SseEmitterRegistry sse;
    private final WhisperProperties props;
    private final String dataDir;

    private final ExecutorService executor;
    private final ConcurrentHashMap<String, AtomicBoolean> cancelFlags = new ConcurrentHashMap<>();

    public SubtitleService(SubtitleJobRepository jobs,
                           AudioExtractor audio,
                           AudioContentProbe audioProbe,
                           WhisperRunner whisper,
                           DeepLXTranslator translator,
                           SseEmitterRegistry sse,
                           WhisperProperties props,
                           @Value("${toolbox.data-dir}") String dataDir) {
        this.jobs = jobs;
        this.audio = audio;
        this.audioProbe = audioProbe;
        this.whisper = whisper;
        this.translator = translator;
        this.sse = sse;
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

    /** Where {@code .vtt} files live. Falls back to {@code ${toolbox.data-dir}/subtitles}. */
    public Path outputDir() {
        return props.getOutputDir().isEmpty()
                ? Path.of(dataDir, "subtitles")
                : Path.of(props.getOutputDir());
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
            Path translated = translator.translateVtt(vtt, lang);
            if (translated != null) {
                jobs.updateTranslatedVttPath(jobId, translated.toAbsolutePath().toString());
                sse.publish(jobId, "translated", Map.of("hasTranslatedVtt", true));
            }
            return translated != null;
        } catch (Exception e) {
            log.warn("translateExisting failed for job {}: {}", jobId, e.getMessage());
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

    private void runJob(SubtitleJob job, Path video, String language, String initialPrompt, AtomicBoolean cancelled) {
        Path tmpWav = outputDir().resolve(".tmp-" + job.getVideoPathHash() + "-" + job.getId() + ".wav");
        Path outputPrefix = outputDir().resolve(job.getVideoPathHash());

        long startedAt = System.currentTimeMillis();
        // 第一步：音频内容预检。先把 job 标成 ANALYZING_AUDIO，前端立即看到状态进展；
        // 跑完拿到 verdict，再决定走 EXTRACTING_AUDIO（继续）还是直接 FAILED（提前止损）。
        job.setStatus(SubtitleStatus.ANALYZING_AUDIO);
        job.setStartedAt(startedAt);
        jobs.updateStatus(job.getId(), job.getStatus(), startedAt, null, null);
        publish(job.getId(), "status", statusEvent(job));

        // 长视频全文件分析可能要几十秒到几分钟。把 ffmpeg 解析出来的百分比转成 0.0~1.0 写
        // 到 job.progress，让前端进度条在这阶段也能"动起来"（之前是不确定 spinner）。
        AudioAnalysis analysis = audioProbe.analyze(video, percent -> {
            double p = Math.max(0, Math.min(99, percent)) / 100.0;
            job.setProgress(p);
            jobs.updateProgress(job.getId(), p);
            publish(job.getId(), "progress", Map.of("progress", p, "percent", percent));
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

        try {
            audio.extract(video, tmpWav);
            if (cancelled.get()) {
                throw new InterruptedException("cancelled before transcription");
            }

            job.setStatus(SubtitleStatus.TRANSCRIBING);
            jobs.updateStatus(job.getId(), job.getStatus(), null, null, null);
            publish(job.getId(), "status", statusEvent(job));

            Path vtt = whisper.run(tmpWav, outputPrefix, language, initialPrompt, new WhisperRunner.ProgressListener() {
                @Override
                public void onProgress(int percent) {
                    double p = percent / 100.0;
                    job.setProgress(p);
                    jobs.updateProgress(job.getId(), p);
                    publish(job.getId(), "progress", Map.of("progress", p, "percent", percent));
                }

                @Override
                public void onLanguageDetected(String iso) {
                    job.setSourceLanguage(iso);
                    jobs.updateLanguage(job.getId(), iso);
                    publish(job.getId(), "language", Map.of("language", iso));
                }
            }, cancelled);

            long finishedAt = System.currentTimeMillis();
            job.setStatus(SubtitleStatus.COMPLETED);
            job.setProgress(1.0);
            job.setVttPath(vtt.toAbsolutePath().toString());
            job.setFinishedAt(finishedAt);
            jobs.updateProgress(job.getId(), 1.0);
            jobs.updateVttPath(job.getId(), job.getVttPath());
            jobs.updateStatus(job.getId(), job.getStatus(), null, finishedAt, null);
            publish(job.getId(), "completed", statusEvent(job));

            // Server-side translation via DeepLX — runs after COMPLETED so SSE is already sent.
            // Failures are non-fatal: original VTT still works; clients fall back to browser API.
            String detectedLang = job.getSourceLanguage();
            if (translator.isEnabled() && translator.shouldTranslate(detectedLang)) {
                try {
                    Path translatedVtt = translator.translateVtt(vtt, detectedLang);
                    if (translatedVtt != null) {
                        job.setTranslatedVttPath(translatedVtt.toAbsolutePath().toString());
                        jobs.updateTranslatedVttPath(job.getId(), job.getTranslatedVttPath());
                        publish(job.getId(), "translated", Map.of("hasTranslatedVtt", true));
                    }
                } catch (Exception e) {
                    log.warn("DeepLX translation failed for job {}: {}", job.getId(), e.getMessage());
                }
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            long finishedAt = System.currentTimeMillis();
            job.setStatus(SubtitleStatus.CANCELLED);
            job.setFinishedAt(finishedAt);
            jobs.updateStatus(job.getId(), job.getStatus(), null, finishedAt, null);
            publish(job.getId(), "cancelled", statusEvent(job));
        } catch (Exception e) {
            log.error("subtitle job {} failed for {}", job.getId(), video, e);
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            long finishedAt = System.currentTimeMillis();
            job.setStatus(SubtitleStatus.FAILED);
            job.setFinishedAt(finishedAt);
            job.setErrorMsg(msg);
            jobs.updateStatus(job.getId(), job.getStatus(), null, finishedAt, msg);
            publish(job.getId(), "error", Map.of("message", msg));
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
