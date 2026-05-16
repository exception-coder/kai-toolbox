package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProcessRegistry;
import com.exceptioncoder.toolbox.treesize.config.WhisperProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Wraps {@code whisper-cli} (whisper.cpp). Designed to be called from a worker thread —
 * blocks until the subprocess exits, parses progress + detected language from stderr live
 * so the SubtitleService can publish them over SSE.
 *
 * <p>Whisper.cpp writes {@code <outputPrefix>.vtt} when given {@code -ovtt -of <outputPrefix>}.
 * On non-zero exit (model file missing, GPU OOM, corrupt audio) we throw with stderr captured.
 *
 * <p>Cancellation: pass an {@link AtomicBoolean}; we poll it every poll-loop iteration and
 * {@code destroyForcibly} the subprocess when it flips. Whisper.cpp doesn't have a graceful
 * stop signal, so destroy is the only option.
 */
@Component
public class WhisperRunner {

    private static final Logger log = LoggerFactory.getLogger(WhisperRunner.class);

    /**
     * Matches both the modern {@code whisper_full_with_state: progress = 5%} and the older
     * {@code whisper_print_progress_callback: progress = 5%}. The number is captured as int.
     */
    private static final Pattern PROGRESS_RE = Pattern.compile("progress\\s*=\\s*(\\d+)%");
    /** Matches {@code auto-detected language: ja (p = 0.987765)} — captures the ISO code. */
    private static final Pattern LANGUAGE_RE = Pattern.compile("auto-detected language:\\s*([a-zA-Z\\-]+)");
    /** Generic poll interval for the cancel flag. */
    private static final long CANCEL_POLL_MS = 250;

    private final WhisperProperties props;
    private final FfmpegProcessRegistry registry;

    public WhisperRunner(WhisperProperties props, FfmpegProcessRegistry registry) {
        this.props = props;
        this.registry = registry;
    }

    public interface ProgressListener {
        void onProgress(int percent);
        void onLanguageDetected(String iso);
    }

    /** Whisper.cpp truncates {@code --prompt} at ~224 tokens. We bound the byte length so a
     *  pasted-in essay doesn't waste tokens; characters past this point are dropped silently. */
    private static final int PROMPT_MAX_CHARS = 800;

    /**
     * Run whisper.cpp synchronously. {@code outputPrefix} is the path without an extension —
     * whisper writes {@code <outputPrefix>.vtt} which we return on success. {@code cancelled}
     * is polled while waiting; {@code null} disables cancellation.
     *
     * <p>{@code initialPrompt} is the optional {@code --prompt} string; pass {@code null} or
     * blank to fall back to {@link WhisperProperties#getDefaultInitialPrompt()}.
     */
    public Path run(Path wav, Path outputPrefix, String language, String initialPrompt,
                    ProgressListener listener, AtomicBoolean cancelled)
            throws IOException, InterruptedException {
        if (!props.isAvailable()) {
            throw new IllegalStateException(
                    "Whisper 不可用：请在 application.yml 配置 toolbox.whisper.binary 与 model-path");
        }
        if (!Files.isRegularFile(Path.of(props.getBinary()))) {
            throw new IllegalStateException("whisper binary not found: " + props.getBinary());
        }
        if (!Files.isRegularFile(Path.of(props.getModelPath()))) {
            throw new IllegalStateException("whisper model not found: " + props.getModelPath());
        }
        Files.createDirectories(outputPrefix.getParent());

        List<String> cmd = buildCommand(wav, outputPrefix, language, initialPrompt);
        log.info("whisper-cli starting: {}", String.join(" ", cmd));

        Process process = registry.spawn(new ProcessBuilder(cmd).redirectErrorStream(true));
        StringBuilder tail = new StringBuilder();
        Thread reader = startStderrReader(process, listener, tail);

        try {
            waitForExit(process, cancelled);
        } finally {
            try {
                reader.join(1000);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }

        if (cancelled != null && cancelled.get()) {
            throw new InterruptedException("whisper run cancelled");
        }
        int exit = process.exitValue();
        if (exit != 0) {
            String snippet = tail.length() > 2000 ? tail.substring(tail.length() - 2000) : tail.toString();
            throw new IOException("whisper-cli exited with " + exit + ":\n" + snippet);
        }

        Path vtt = Path.of(outputPrefix.toAbsolutePath() + ".vtt");
        if (!Files.isRegularFile(vtt)) {
            // whisper.cpp 在每一段都被判定为非语音时不会写 .vtt 文件，退出码仍是 0。
            // 直接抛错让 job 进 FAILED 状态，前端展示具体原因；这比悄悄生成一个空 VTT 让用户
            // 看到「已生成」但播放无字幕要诚实得多。常见诱因：源音频纯音乐 / 整段静默、或
            // 老旧容器（.rmvb 里的 cook 编码）被 ffmpeg 解出空音轨。
            throw new IOException(
                    "音频中未识别到可转写的语音内容（whisper 退出 0 但未生成字幕）。"
                            + "常见原因：纯音乐 / 全静默 / 老旧编码（如 .rmvb 的 RealAudio cook）"
                            + "在当前 ffmpeg 下解码不完整。可尝试用其他播放器确认源视频是否有语音。");
        }
        return vtt;
    }

    private List<String> buildCommand(Path wav, Path outputPrefix, String language, String initialPrompt) {
        List<String> cmd = new ArrayList<>();
        cmd.add(props.getBinary());
        cmd.add("-m"); cmd.add(props.getModelPath());
        cmd.add("-f"); cmd.add(wav.toAbsolutePath().toString());
        // "auto" triggers whisper's language detection; an explicit code (e.g. "ja") forces the
        // transcription language and is far more reliable for non-English content.
        cmd.add("-l"); cmd.add(language == null || language.isBlank() ? "auto" : language);
        cmd.add("-ovtt");
        cmd.add("-of"); cmd.add(outputPrefix.toAbsolutePath().toString());
        cmd.add("-pp");
        // -nt suppresses timestamp printing in the segment dump but still writes them to VTT;
        // less log noise. -np suppresses the per-segment colored print.
        cmd.add("-np");
        // -su (split-on-word): split 30 s chunks on word boundaries instead of raw token
        // boundaries. Without this, whisper's chunker happily slices through the middle of a
        // word — the second chunk then doesn't recognise the partial prefix and drops the word
        // entirely, which is the most common "吞字" pattern users hit on long videos.
        cmd.add("-su");

        // --prompt seeds the decoder with a 224-token context that the model treats as a
        // continuation prompt. Per-job string wins over the global default; both are bounded
        // by PROMPT_MAX_CHARS to keep the command line + token budget sane.
        String prompt = firstNonBlank(initialPrompt, props.getDefaultInitialPrompt());
        if (prompt != null) {
            String trimmed = prompt.length() > PROMPT_MAX_CHARS ? prompt.substring(0, PROMPT_MAX_CHARS) : prompt;
            cmd.add("--prompt"); cmd.add(trimmed);
        }

        // VAD pre-segments audio into speech regions, skipping silence entirely. Long videos
        // with sparse speech see both a speed win (no compute on silence) and an accuracy win
        // (whisper hallucinates less on quiet segments). Disabled unless the VAD model is
        // configured and actually present on disk — otherwise whisper-cli would fail to start.
        String vadModel = props.getVadModelPath();
        if (!vadModel.isEmpty() && Files.isRegularFile(Path.of(vadModel))) {
            cmd.add("--vad");
            cmd.add("--vad-model"); cmd.add(vadModel);
        }

        if (props.getThreads() > 0) {
            cmd.add("-t"); cmd.add(Integer.toString(props.getThreads()));
        }
        if (props.isDisableGpu()) {
            cmd.add("--no-gpu");
        } else if (props.isFlashAttention()) {
            // Flash Attention reorders attention matmuls to fit GPU SRAM, giving 30-50%
            // throughput at identical numerical output. Only valid on CUDA / cuBLAS builds;
            // CPU builds silently ignore the flag but we still gate on isDisableGpu to keep
            // the command surface obvious in the launch log.
            cmd.add("-fa");
        }
        return cmd;
    }

    /** Returns the first argument that isn't null and isn't blank after trimming; null otherwise. */
    private static String firstNonBlank(String... candidates) {
        for (String s : candidates) {
            if (s != null && !s.isBlank()) return s.trim();
        }
        return null;
    }

    private Thread startStderrReader(Process process, ProgressListener listener, StringBuilder tail) {
        return Thread.ofVirtual().name("whisper-out").start(() -> {
            try (var br = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                int lastPercent = -1;
                while ((line = br.readLine()) != null) {
                    if (log.isDebugEnabled()) log.debug("[whisper] {}", line);
                    appendBounded(tail, line);

                    Matcher pm = PROGRESS_RE.matcher(line);
                    if (pm.find()) {
                        int p = Integer.parseInt(pm.group(1));
                        // Whisper sometimes emits the same percentage repeatedly — debounce so
                        // we don't flood SSE listeners with no-op events.
                        if (p != lastPercent) {
                            lastPercent = p;
                            try {
                                listener.onProgress(p);
                            } catch (Exception e) {
                                log.warn("progress listener threw: {}", e.toString());
                            }
                        }
                        continue;
                    }
                    Matcher lm = LANGUAGE_RE.matcher(line);
                    if (lm.find()) {
                        try {
                            listener.onLanguageDetected(lm.group(1));
                        } catch (Exception e) {
                            log.warn("language listener threw: {}", e.toString());
                        }
                    }
                }
            } catch (IOException ignored) {
            }
        });
    }

    /** Keeps the last ~16 KB of output for error reporting without growing unbounded. */
    private static void appendBounded(StringBuilder buf, String line) {
        if (buf.length() > 16384) {
            buf.delete(0, buf.length() - 8192);
        }
        buf.append(line).append('\n');
    }

    private void waitForExit(Process process, AtomicBoolean cancelled) throws InterruptedException {
        long deadlineNanos = props.getTimeoutSeconds() > 0
                ? System.nanoTime() + TimeUnit.SECONDS.toNanos(props.getTimeoutSeconds())
                : Long.MAX_VALUE;
        while (process.isAlive()) {
            if (cancelled != null && cancelled.get()) {
                process.destroyForcibly();
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.waitFor(2, TimeUnit.SECONDS);
                return;
            }
            if (System.nanoTime() > deadlineNanos) {
                process.destroyForcibly();
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.waitFor(2, TimeUnit.SECONDS);
                throw new InterruptedException(
                        "whisper run exceeded timeout " + props.getTimeoutSeconds() + "s");
            }
            process.waitFor(CANCEL_POLL_MS, TimeUnit.MILLISECONDS);
        }
    }
}
