package com.exceptioncoder.toolbox.ffmpeglab.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProbe;
import com.exceptioncoder.toolbox.common.media.FfmpegProcessRegistry;
import com.exceptioncoder.toolbox.common.media.FfmpegUnavailableException;
import com.exceptioncoder.toolbox.common.media.ProbeResult;
import com.exceptioncoder.toolbox.ffmpeglab.api.dto.ModeView;
import com.exceptioncoder.toolbox.ffmpeglab.api.dto.ProbeView;
import com.exceptioncoder.toolbox.ffmpeglab.api.dto.RunRequest;
import com.exceptioncoder.toolbox.ffmpeglab.config.FfmpegLabProperties;
import com.exceptioncoder.toolbox.ffmpeglab.domain.ModePrediction;
import com.exceptioncoder.toolbox.ffmpeglab.domain.RunResult;
import com.exceptioncoder.toolbox.ffmpeglab.domain.TranscodeMode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Stream;

/**
 * 实验台编排核心：探测 → 每模式预判 + 命令预览 → 实跑 → 诊断。
 *
 * <p>临时文件类模式（remux / progressive / hls-ts / hls-fmp4）阻塞跑完 ffmpeg 并把物料落到
 * {@code workDir/{runId}/}；流式模式（mjpeg）由 {@link #streamMjpeg} 在播放端点直出，结束后回填诊断。
 * 进程卫生全部走 {@link FfmpegProcessRegistry}。
 */
@Service
public class FfmpegLabService {

    private static final Logger log = LoggerFactory.getLogger(FfmpegLabService.class);
    /** 单次运行硬超时：整片转码长视频也要有上界，避免线程长期占着；超时即强杀并记失败。 */
    private static final long MAX_RUN_SECONDS = 600;
    private static final long PROCESS_GRACE_MS = 2000;

    private final FfmpegProbe probe;
    private final FfmpegProcessRegistry registry;
    private final FfmpegLabProperties props;
    private final ModeCommandBuilder commands;
    private final RunDiagnosticsCollector diagnostics;

    public FfmpegLabService(FfmpegProbe probe, FfmpegProcessRegistry registry, FfmpegLabProperties props,
                            ModeCommandBuilder commands, RunDiagnosticsCollector diagnostics) {
        this.probe = probe;
        this.registry = registry;
        this.props = props;
        this.commands = commands;
        this.diagnostics = diagnostics;
    }

    // ============================ 探测 + 预判 ============================

    public ProbeView probeAndPredict(String path, Integer clipSecondsRaw) throws IOException {
        int clipSeconds = resolveClip(clipSecondsRaw);
        Path file = resolveInput(path);
        boolean available = probe.isFfmpegAvailable();
        ProbeResult info = available ? probe.probe(file) : ProbeResult.UNKNOWN;
        boolean nativelyPlayable = available && probe.nativelyPlayable(info);

        // 命令预览用一个占位 workDir（不真正创建），保证「看到的命令 = 跑的命令」结构一致。
        Path previewDir = Path.of(props.getWorkDir(), "{runId}");
        List<ModeView> modes = new ArrayList<>();
        for (TranscodeMode mode : TranscodeMode.values()) {
            ModePrediction prediction = predict(mode, info, nativelyPlayable);
            modes.add(new ModeView(
                    mode.name(),
                    mode.label(),
                    mode.playKind().name().toLowerCase(),
                    prediction.name(),
                    predictionReason(mode, prediction, info),
                    commands.preview(mode, file, info, clipSeconds, previewDir)
            ));
        }

        ProbeView.ProbeInfo probeInfo = new ProbeView.ProbeInfo(
                info.container(), info.videoCodec(), info.audioCodec(), info.durationSeconds(), nativelyPlayable);
        return new ProbeView(available, probeInfo, modes);
    }

    /** Remux 仅在 copy 条件满足时预判 OK，否则 FAIL；其余模式一律 TRANSCODE（预期可成）。 */
    private ModePrediction predict(TranscodeMode mode, ProbeResult info, boolean nativelyPlayable) {
        if (mode == TranscodeMode.REMUX_COPY) {
            boolean canCopy = probe.canCopyVideo(info) && probe.canCopyAudio(info);
            return canCopy ? ModePrediction.OK : ModePrediction.FAIL;
        }
        return ModePrediction.TRANSCODE;
    }

    private String predictionReason(TranscodeMode mode, ModePrediction prediction, ProbeResult info) {
        if (mode == TranscodeMode.REMUX_COPY) {
            return prediction == ModePrediction.OK
                    ? "视频/音频编码已是 mp4 原生兼容，可直接 copy 出 web"
                    : "视频 " + info.videoCodec() + " / 音频 " + info.audioCodec() + " 非 mp4 原生兼容，copy 无法出 web";
        }
        return switch (mode) {
            case PROGRESSIVE_MP4 -> "重编码到 H.264/AAC，浏览器原生播放的通用兜底";
            case HLS_TS -> "切 MPEG-TS 分段（兼容编码可 copy），hls.js 播放";
            case HLS_FMP4 -> "重编码切 fMP4/CMAF 分段，hls.js 播放（现代封装）";
            case MJPEG -> "抽帧为 JPEG 流，无音频，怪格式「至少看到画面」的兜底";
            default -> "";
        };
    }

    // ============================ 运行（临时文件类） ============================

    /**
     * 运行临时文件类模式：阻塞至 ffmpeg 退出，物料落到 {@code workDir/{runId}/}。
     * 流式模式（MJPEG）不在这里跑——调用方应走 {@link #streamMjpeg}，本方法只为它生成 runId 与播放地址。
     */
    public RunOutcome run(RunRequest req) throws IOException {
        if (!probe.isFfmpegAvailable()) {
            throw new FfmpegUnavailableException("FFmpeg 不可用，请在 application.yml 配置 toolbox.ffmpeg.binary");
        }
        TranscodeMode mode = parseMode(req.mode());
        int clipSeconds = resolveClip(req.clipSeconds());
        Path file = resolveInput(req.path());
        ProbeResult info = probe.probe(file);
        String runId = UUID.randomUUID().toString().substring(0, 8);

        cleanStaleWorkDirs();
        Path runDir = Path.of(props.getWorkDir(), runId);
        Files.createDirectories(runDir);

        if (mode.streaming()) {
            // MJPEG：此刻不跑 ffmpeg，仅返回 runId + 流式播放地址；诊断在流结束后由 streamMjpeg 回填。
            String command = String.join(" ", commands.build(mode, file, info, clipSeconds, runDir));
            return new RunOutcome(runId, mode, true, true, 0, command, null, null, 0L, List.of(), file, clipSeconds);
        }

        List<String> cmd = commands.build(mode, file, info, clipSeconds, runDir);
        String command = String.join(" ", cmd);
        Deque<String> tail = new ArrayDeque<>();
        long t0 = System.nanoTime();
        int exitCode = -1;
        boolean timedOut = false;

        Process process = registry.spawn(new ProcessBuilder(cmd).redirectErrorStream(true));
        // redirectErrorStream(true)：stderr 已并入 stdout，读 getInputStream 即可。
        Thread drain = startTailDrain(process.getInputStream(), tail, "ffmpeg-lab-" + runId);
        try {
            if (!process.waitFor(MAX_RUN_SECONDS, TimeUnit.SECONDS)) {
                timedOut = true;
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            } else {
                exitCode = process.exitValue();
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
        } finally {
            try { drain.join(500); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
        }

        long totalMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - t0);
        long outputBytes = dirSize(runDir);
        Path artifact = mainArtifact(mode, runDir);
        boolean produced = artifact != null;
        boolean success = !timedOut && exitCode == 0 && produced;
        // NATIVE 类（remux / progressive）：封装成功 ≠ 浏览器能解码。再探一次产物，要求原生可播才算真成功，
        // 否则 .amc 这类 copy 出的 mp4 会假绿（ffmpeg exit 0 但 mpeg4/qcelp 浏览器放不出）。
        if (success && mode.playKind() == TranscodeMode.PlayKind.NATIVE) {
            ProbeResult outInfo = probe.probe(artifact);
            if (!probe.nativelyPlayable(outInfo)) {
                success = false;
                tail.addLast("[ffmpeg-lab] 容器封装成功但产物编码(" + outInfo.videoCodec() + "/" + outInfo.audioCodec()
                        + ")非浏览器原生可播，换 Progressive 全转码");
            }
        }
        if (timedOut) {
            tail.addLast("[ffmpeg-lab] 运行超过 " + MAX_RUN_SECONDS + "s 被强杀；可调小 clipSeconds 重试");
        }
        List<String> stderrTail = new ArrayList<>(tail);

        RunResult result = new RunResult(runId, mode, false, success, exitCode, command,
                null, totalMs, outputBytes, stderrTail, System.currentTimeMillis());
        diagnostics.record(result);
        log.info("ffmpeg-lab run mode={} success={} exit={} totalMs={} bytes={} runId={}",
                mode, success, exitCode, totalMs, outputBytes, runId);
        return RunOutcome.fromResult(result, file, clipSeconds);
    }

    // ============================ 流式（MJPEG） ============================

    /**
     * 直出 MJPEG multipart 流到 {@code out}。结束（正常完成 / 客户端断开 / ffmpeg 失败）后回填诊断。
     * 永不抛业务异常——客户端断开属预期，按失败记录即可。
     */
    public void streamMjpeg(String runId, Path file, int clipSeconds, OutputStream out) throws IOException {
        if (!probe.isFfmpegAvailable()) {
            throw new FfmpegUnavailableException("FFmpeg 不可用，请在 application.yml 配置 toolbox.ffmpeg.binary");
        }
        ProbeResult info = probe.probe(file);
        List<String> cmd = commands.build(TranscodeMode.MJPEG, file, info, clipSeconds, Path.of(props.getWorkDir()));
        String command = String.join(" ", cmd);
        Deque<String> tail = new ArrayDeque<>();
        long t0 = System.nanoTime();
        AtomicLong firstByteNanos = new AtomicLong(-1);
        AtomicLong bytes = new AtomicLong(0);
        boolean aborted = false;
        int exitCode = -1;

        Process process = registry.spawn(new ProcessBuilder(cmd).redirectErrorStream(false));
        // mjpeg 数据走 stdout（下面消费），诊断从独立 stderr 读尾部。
        Thread stderrDrain = startTailDrain(process.getErrorStream(), tail, "ffmpeg-lab-mjpeg-err-" + runId);
        try (var stdout = process.getInputStream()) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = stdout.read(buf)) > 0) {
                if (firstByteNanos.get() < 0) firstByteNanos.set(System.nanoTime());
                out.write(buf, 0, n);
                out.flush();
                bytes.addAndGet(n);
            }
        } catch (IOException e) {
            // 客户端断开（img 卸载）最常见，按预期处理。
            aborted = true;
            log.debug("ffmpeg-lab mjpeg stream aborted runId={}: {}", runId, e.toString());
        } finally {
            reap(process);
            if (!aborted) {
                try { exitCode = process.exitValue(); } catch (IllegalThreadStateException ignored) { }
            }
            try { stderrDrain.join(500); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }

            long totalMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - t0);
            Long firstByteMs = firstByteNanos.get() < 0 ? null
                    : TimeUnit.NANOSECONDS.toMillis(firstByteNanos.get() - t0);
            boolean success = !aborted && exitCode == 0 && bytes.get() > 0;
            RunResult result = new RunResult(runId, TranscodeMode.MJPEG, true, success, exitCode, command,
                    firstByteMs, totalMs, bytes.get(), new ArrayList<>(tail), System.currentTimeMillis());
            diagnostics.record(result);
            log.info("ffmpeg-lab mjpeg success={} firstByte={}ms bytes={} aborted={} runId={}",
                    success, firstByteMs, bytes.get(), aborted, runId);
        }
    }

    // ============================ 物料定位（供 controller 托管） ============================

    /** 某 runId 的物料目录。 */
    public Path artifactDir(String runId) {
        return Path.of(props.getWorkDir(), runId);
    }

    /**
     * 解析 runId 目录下的某个文件名，做路径穿越防护。
     * @throws NoSuchFileException 文件不存在或越界
     */
    public Path resolveArtifact(String runId, String name) throws NoSuchFileException {
        Path dir = artifactDir(runId).toAbsolutePath().normalize();
        Path target = dir.resolve(name).normalize();
        if (!target.startsWith(dir) || !Files.isRegularFile(target)) {
            throw new NoSuchFileException(runId + "/" + name);
        }
        return target;
    }

    public List<RunResult> recent() {
        return diagnostics.recent();
    }

    public int activeFfmpegCount() {
        return registry.activeCount();
    }

    public int defaultClipSeconds() {
        return props.getDefaultClipSeconds();
    }

    // ============================ 内部工具 ============================

    private int resolveClip(Integer raw) {
        if (raw == null) return props.getDefaultClipSeconds();
        return Math.max(0, raw);
    }

    private Path resolveInput(String path) throws NoSuchFileException {
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException("path 不能为空");
        }
        Path file = Path.of(path).normalize();
        if (!Files.isRegularFile(file)) {
            throw new NoSuchFileException(path);
        }
        return file;
    }

    private TranscodeMode parseMode(String mode) {
        try {
            return TranscodeMode.valueOf(mode);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new IllegalArgumentException("未知模式: " + mode);
        }
    }

    /** 主产物：mp4 类取 out.mp4，hls 类取 index.m3u8；不存在返回 null。 */
    private Path mainArtifact(TranscodeMode mode, Path runDir) {
        Path p = switch (mode) {
            case REMUX_COPY, PROGRESSIVE_MP4 -> runDir.resolve("out.mp4");
            case HLS_TS, HLS_FMP4 -> runDir.resolve("index.m3u8");
            case MJPEG -> null;
        };
        return (p != null && Files.isRegularFile(p)) ? p : null;
    }

    private long dirSize(Path dir) {
        try (Stream<Path> s = Files.walk(dir)) {
            return s.filter(Files::isRegularFile).mapToLong(p -> {
                try { return Files.size(p); } catch (IOException e) { return 0; }
            }).sum();
        } catch (IOException e) {
            return 0;
        }
    }

    /** 清理超过保留期的旧 runId 目录。失败仅告警，不阻断运行。 */
    private void cleanStaleWorkDirs() {
        Path root = Path.of(props.getWorkDir());
        if (!Files.isDirectory(root)) return;
        long cutoff = System.currentTimeMillis() - props.getRetainMinutes() * 60_000L;
        try (Stream<Path> children = Files.list(root)) {
            children.filter(Files::isDirectory)
                    .filter(d -> lastModified(d) < cutoff)
                    .forEach(this::deleteRecursively);
        } catch (IOException e) {
            log.warn("ffmpeg-lab 清理过期 workDir 失败: {}", e.toString());
        }
    }

    private long lastModified(Path p) {
        try { return Files.getLastModifiedTime(p).toMillis(); } catch (IOException e) { return Long.MAX_VALUE; }
    }

    private void deleteRecursively(Path dir) {
        try (Stream<Path> s = Files.walk(dir)) {
            s.sorted(Comparator.reverseOrder()).forEach(p -> {
                try { Files.deleteIfExists(p); } catch (IOException ignored) { }
            });
        } catch (IOException e) {
            log.warn("ffmpeg-lab 删除 workDir 子目录失败 {}: {}", dir, e.toString());
        }
    }

    private Thread startTailDrain(java.io.InputStream in, Deque<String> tail, String name) {
        int limit = Math.max(5, props.getStderrTailLines());
        return Thread.ofVirtual().name(name).start(() -> {
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(in, StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    synchronized (tail) {
                        tail.addLast(line);
                        while (tail.size() > limit) tail.pollFirst();
                    }
                }
            } catch (IOException ignored) {
            }
        });
    }

    private static void reap(Process process) {
        try {
            if (!process.waitFor(PROCESS_GRACE_MS, TimeUnit.MILLISECONDS)) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
        }
    }

    /**
     * 运行结果 + 播放上下文。controller 据此生成 playUrl 并转成 RunResultView。
     */
    public record RunOutcome(
            String runId,
            TranscodeMode mode,
            boolean streaming,
            boolean success,
            int exitCode,
            String command,
            Long firstByteMs,
            Long totalMs,
            long outputBytes,
            List<String> stderrTail,
            Path input,
            int clipSeconds
    ) {
        static RunOutcome fromResult(RunResult r, Path input, int clipSeconds) {
            return new RunOutcome(r.runId(), r.mode(), r.streaming(), r.success(), r.exitCode(), r.command(),
                    r.firstByteMs(), r.totalMs(), r.outputBytes(), r.stderrTail(), input, clipSeconds);
        }
    }
}
