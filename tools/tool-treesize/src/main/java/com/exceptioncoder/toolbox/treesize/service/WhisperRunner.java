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

    /**
     * Run whisper.cpp synchronously. {@code outputPrefix} is the path without an extension —
     * whisper writes {@code <outputPrefix>.vtt} which we return on success. {@code cancelled}
     * is polled while waiting; {@code null} disables cancellation.
     */
    public Path run(Path wav, Path outputPrefix, String language, ProgressListener listener,
                    AtomicBoolean cancelled) throws IOException, InterruptedException {
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

        List<String> cmd = buildCommand(wav, outputPrefix, language);
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
            throw new IOException("whisper-cli reported success but produced no VTT at " + vtt);
        }
        return vtt;
    }

    private List<String> buildCommand(Path wav, Path outputPrefix, String language) {
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
        if (props.getThreads() > 0) {
            cmd.add("-t"); cmd.add(Integer.toString(props.getThreads()));
        }
        if (props.isDisableGpu()) {
            cmd.add("--no-gpu");
        }
        return cmd;
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
