package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProcessRegistry;
import com.exceptioncoder.toolbox.treesize.config.WhisperProperties;
import com.exceptioncoder.toolbox.treesize.domain.DetectedLanguage;
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
    /** {@link #LANGUAGE_RE} 的同条目变体——同时捕获 ISO 与 p 值，{@code detectLanguage()} 用。 */
    private static final Pattern LANGUAGE_RE_WITH_P = Pattern.compile(
            "auto-detected language:\\s*([a-zA-Z\\-]+)\\s*\\(p\\s*=\\s*(\\d+(?:\\.\\d+)?)\\)");
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
            // 把 stderr 最后 2000 字符塞进异常消息 —— 这是定位「某个参数不被这个 whisper.cpp
            // 版本支持」的关键线索（前 600 字符常常只够看到 OPTIONS 帮助末尾的 VAD 段，看不到
            // 前面的 "error: unknown argument" 行；2000 字符能覆盖完整的 OPTIONS 列表 + 错误）。
            String snippet = tail.length() > 2000 ? tail.substring(tail.length() - 2000) : tail.toString();
            throw new IOException(
                    "音频中未识别到可转写的语音内容（whisper 退出 0 但未生成字幕）。"
                            + "常见原因：纯音乐 / 全静默 / 老旧编码（如 .rmvb 的 RealAudio cook）"
                            + "在当前 ffmpeg 下解码不完整；或某个 whisper 参数不被当前版本支持。\n"
                            + "—— whisper 输出末尾 ——\n" + snippet);
        }
        return vtt;
    }

    private List<String> buildCommand(Path wav, Path outputPrefix, String language, String initialPrompt) {
        // 所有 flag 字面值都从 yml(toolbox.whisper.cli.*)注入,whisper.cpp 升级后不需要重编译。
        WhisperProperties.CliFlags f = props.getCli();
        List<String> cmd = new ArrayList<>();
        cmd.add(props.getBinary());
        cmd.add(f.getModelFlag()); cmd.add(props.getModelPath());
        cmd.add(f.getFileFlag()); cmd.add(wav.toAbsolutePath().toString());
        // "auto" triggers whisper's language detection; an explicit code (e.g. "ja") forces the
        // transcription language and is far more reliable for non-English content.
        cmd.add(f.getLanguageFlag()); cmd.add(language == null || language.isBlank() ? "auto" : language);
        cmd.add(f.getOutputVttFlag());
        cmd.add(f.getOutputPrefixFlag()); cmd.add(outputPrefix.toAbsolutePath().toString());
        cmd.add(f.getPrintProgressFlag());
        cmd.add(f.getSuppressPrintsFlag());
        // split-on-word 改为可选项 —— 实测部分 whisper.cpp 构建即使官方文档支持
        // 此参数，传上去后整段转写不写 VTT 文件。用户在 yml 显式 opt-in 后才传。
        if (props.isSplitOnWord()) {
            cmd.add(f.getSplitOnWordFlag());
        }

        // --prompt seeds the decoder with a 224-token context that the model treats as a
        // continuation prompt. Per-job string wins over the global default; both are bounded
        // by PROMPT_MAX_CHARS to keep the command line + token budget sane.
        String prompt = firstNonBlank(initialPrompt, props.getDefaultInitialPrompt());
        if (prompt != null) {
            String trimmed = prompt.length() > PROMPT_MAX_CHARS ? prompt.substring(0, PROMPT_MAX_CHARS) : prompt;
            cmd.add(f.getPromptFlag()); cmd.add(trimmed);
        }

        // VAD pre-segments audio into speech regions, skipping silence entirely. Long videos
        // with sparse speech see both a speed win (no compute on silence) and an accuracy win
        // (whisper hallucinates less on quiet segments). Disabled unless the VAD model is
        // configured and actually present on disk — otherwise whisper-cli would fail to start.
        String vadModel = props.getVadModelPath();
        if (!vadModel.isEmpty() && Files.isRegularFile(Path.of(vadModel))) {
            cmd.add(f.getVadFlag());
            cmd.add(f.getVadModelFlag()); cmd.add(vadModel);
        }

        // 反幻觉三件套。视频中后段是哭声/喘息/配乐等非语音时,whisper 容易陷入复读 non-speech
        // 标签的幻觉。三个阈值收紧后,模型会更倾向把这种段直接判 no-speech 或触发 temperature
        // fallback 而不是硬输出。
        cmd.add(f.getNoSpeechTholdFlag()); cmd.add(Double.toString(props.getNoSpeechThreshold()));
        cmd.add(f.getLogprobTholdFlag()); cmd.add(Double.toString(props.getLogprobThreshold()));
        cmd.add(f.getEntropyTholdFlag()); cmd.add(Double.toString(props.getEntropyThreshold()));
        // no-context 等价。老版 whisper.cpp 是 -nc(无参数),新版是 --max-context N。
        // CliFlags 默认配 "-mc" + "0",老版本只需 yml 改 max-context-flag: "-nc" 并把
        // max-context-value-for-no-context 设为空字符串即可。
        if (props.isNoContext()) {
            cmd.add(f.getMaxContextFlag());
            String v = f.getMaxContextValueForNoContext();
            if (v != null && !v.isEmpty()) {
                cmd.add(v);
            }
        }

        if (props.getThreads() > 0) {
            cmd.add(f.getThreadsFlag()); cmd.add(Integer.toString(props.getThreads()));
        }
        if (props.isDisableGpu()) {
            cmd.add(f.getNoGpuFlag());
        } else if (props.isFlashAttention()) {
            // Flash Attention reorders attention matmuls to fit GPU SRAM, giving 30-50%
            // throughput at identical numerical output. Only valid on CUDA / cuBLAS builds;
            // CPU builds silently ignore the flag but we still gate on isDisableGpu to keep
            // the command surface obvious in the launch log.
            cmd.add(f.getFlashAttnFlag());
        }

        // extra-args:yml 配置的兜底逃生口。原样追加,适合临时验证 -bs 5 / --temperature 0.0
        // 之类实验性 flag,而不用回 Java 加字段。
        if (!f.getExtraArgs().isEmpty()) {
            cmd.addAll(f.getExtraArgs());
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

    /**
     * detect-language-only 模式（whisper-cli {@code --detect-language}）：解码音频前段
     * 提取 mel-spectrogram 仅判语言，不写 VTT，单文件 1-3 秒。给"视频语言识别"批量任务用。
     *
     * <p>命令构造刻意脱离 {@link #buildCommand}——后者一堆 transcription 专用 flag
     * （-ovtt / -of / -pp / VAD / no-context / 反幻觉阈值）在 {@code --detect-language}
     * 下纯粹是噪音，部分构建甚至会因为冲突直接退出非零。这里只保留 model/file/GPU 三件套。
     *
     * @param wav       已抽好的 16kHz 单声道 WAV（{@code FfmpegProcessRegistry#extractAudioSlice}）
     * @param cancelled 取消标志；为 {@code null} 不可取消
     * @return 解析出的 ISO 码 + p 值
     */
    public DetectedLanguage detectLanguage(Path wav, AtomicBoolean cancelled)
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

        WhisperProperties.CliFlags f = props.getCli();
        List<String> cmd = new ArrayList<>();
        cmd.add(props.getBinary());
        cmd.add(f.getModelFlag()); cmd.add(props.getModelPath());
        cmd.add(f.getFileFlag());  cmd.add(wav.toAbsolutePath().toString());
        cmd.add("--detect-language");   // whisper.cpp 标准 flag,各 build 名称稳定,不进 CliFlags
        if (props.isDisableGpu()) {
            cmd.add(f.getNoGpuFlag());
        } else if (props.isFlashAttention()) {
            cmd.add(f.getFlashAttnFlag());
        }

        log.debug("whisper-cli -dl: {}", String.join(" ", cmd));
        Process process = registry.spawn(new ProcessBuilder(cmd).redirectErrorStream(true));
        StringBuilder out = new StringBuilder();
        Thread reader = Thread.ofVirtual().name("whisper-dl").start(() -> {
            try (var br = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    appendBounded(out, line);
                }
            } catch (IOException ignored) {
            }
        });

        try {
            waitForExit(process, cancelled);
        } finally {
            try { reader.join(1000); } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
        if (cancelled != null && cancelled.get()) {
            throw new InterruptedException("whisper detect-language cancelled");
        }
        if (process.exitValue() != 0) {
            String snippet = out.length() > 1000 ? out.substring(out.length() - 1000) : out.toString();
            throw new IOException("whisper-cli -dl exited " + process.exitValue() + ":\n" + snippet);
        }
        Matcher m = LANGUAGE_RE_WITH_P.matcher(out);
        if (!m.find()) {
            String snippet = out.length() > 1000 ? out.substring(out.length() - 1000) : out.toString();
            throw new IOException("whisper-cli -dl: language line not found in output:\n" + snippet);
        }
        return new DetectedLanguage(m.group(1), Double.parseDouble(m.group(2)));
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
