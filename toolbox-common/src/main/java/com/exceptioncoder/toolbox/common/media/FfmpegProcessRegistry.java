package com.exceptioncoder.toolbox.common.media;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Tracks every ffmpeg / ffprobe child process spawned by the toolkit so they can be
 * force-killed on JVM shutdown. Without this, child processes outlive the JVM on Windows
 * (and get re-parented to PID 1 on Linux) and continue burning CPU until they finish
 * naturally.
 *
 * <p>Coverage: graceful exits — JVM normal exit, SIGTERM, Spring context close, IDE stop —
 * all fire either the shutdown hook or {@code @PreDestroy}. A {@code kill -9} /
 * {@code taskkill /F} cannot be intercepted by any code; that's an OS-level constraint.
 */
@Component
public class FfmpegProcessRegistry {

    private static final Logger log = LoggerFactory.getLogger(FfmpegProcessRegistry.class);

    private final FfmpegProperties props;
    private final Set<Process> active = ConcurrentHashMap.newKeySet();

    public FfmpegProcessRegistry(FfmpegProperties props) {
        this.props = props;
        Runtime.getRuntime().addShutdownHook(new Thread(this::reapAll, "ffmpeg-reap"));
    }

    /**
     * One-shot orphan reap on startup. Walks every process the OS exposes and force-kills
     * the ones whose command path matches our configured {@code toolbox.ffmpeg.binary} or
     * {@code toolbox.ffmpeg.ffprobe-binary} — those are the ones a previous JVM process must
     * have spawned and that survived a {@code kill -9 / taskkill /F}.
     *
     * <p>Only runs when the configured paths are absolute. A relative name like {@code ffmpeg}
     * could match the user's unrelated concurrent ffmpeg work (different cmd window, video
     * editor, etc.); we skip the reap rather than risk stomping on it.
     */
    @PostConstruct
    void reapStaleOrphansAtStartup() {
        Path ffmpegAbs = absoluteOrNull(props.getBinary());
        Path ffprobeAbs = absoluteOrNull(props.getFfprobeBinary());
        if (ffmpegAbs == null && ffprobeAbs == null) {
            log.debug("ffmpeg/ffprobe paths are relative; skipping startup orphan reap");
            return;
        }
        String ffmpegCanonical = ffmpegAbs == null ? null : canonical(ffmpegAbs);
        String ffprobeCanonical = ffprobeAbs == null ? null : canonical(ffprobeAbs);

        long ourPid = ProcessHandle.current().pid();
        int killed = 0;
        for (ProcessHandle ph : ProcessHandle.allProcesses().toList()) {
            if (ph.pid() == ourPid) continue;
            String cmd = ph.info().command().orElse("");
            if (cmd.isEmpty()) continue;
            String cmdCanonical;
            try {
                cmdCanonical = canonical(Path.of(cmd));
            } catch (InvalidPathException e) {
                continue;
            }
            if (cmdCanonical.equals(ffmpegCanonical) || cmdCanonical.equals(ffprobeCanonical)) {
                log.info("reaping stale orphan: pid={} cmd={}", ph.pid(), cmd);
                ph.destroyForcibly();
                killed++;
            }
        }
        if (killed > 0) {
            log.warn("destroyed {} stale ffmpeg/ffprobe processes from a previous force-killed run", killed);
        }
    }

    private static Path absoluteOrNull(String s) {
        if (s == null || s.isEmpty()) return null;
        try {
            Path p = Path.of(s).normalize();
            return p.isAbsolute() ? p : null;
        } catch (InvalidPathException e) {
            return null;
        }
    }

    /** Lowercase string of an absolute, normalized path — sufficient for case-insensitive Windows match. */
    private static String canonical(Path p) {
        return p.toAbsolutePath().normalize().toString().toLowerCase(Locale.ROOT);
    }

    /** ffmpeg stderr 末尾保留行数：够定位 "no stream"/"Invalid data"/"moov atom"，不至于撑爆内存。 */
    private static final int STDERR_TAIL_LINES = 40;

    /** 启一个 virtual thread 把合并后的 stdout+stderr 读成行，只保留末 {@code STDERR_TAIL_LINES} 行用于报错。 */
    private static Thread startTailDrain(Process p, Deque<String> tail, String threadName) {
        return Thread.ofVirtual().name(threadName).start(() -> {
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    synchronized (tail) {
                        tail.addLast(line);
                        while (tail.size() > STDERR_TAIL_LINES) tail.pollFirst();
                    }
                }
            } catch (IOException ignored) {
            }
        });
    }

    /** 把 tail buffer 拼成 IOException message 末尾的诊断片段。 */
    private static String tailToString(Deque<String> tail) {
        synchronized (tail) {
            if (tail.isEmpty()) return "<no stderr>";
            return String.join(" | ", tail);
        }
    }

    /**
     * Convenience: start a process and track it in one call. The {@link Process#onExit()}
     * future auto-removes the entry when the process exits naturally, so callers never
     * need to "untrack".
     */
    public Process spawn(ProcessBuilder pb) throws IOException {
        return track(pb.start());
    }

    public Process track(Process p) {
        active.add(p);
        p.onExit().whenComplete((res, ex) -> active.remove(p));
        return p;
    }

    /** Current count of live ffmpeg/ffprobe processes the toolkit has spawned. */
    public int activeCount() {
        return active.size();
    }

    /**
     * 抽视频中某段为 whisper 兼容的 16kHz 单声道 WAV。语言识别用——抽 60s 给 whisper 判语言。
     * 输出已存在会被覆盖（{@code -y}）。{@code outWav} 父目录会自动建。
     */
    public void extractAudioSlice(Path src, double startSec, double durationSec, Path outWav)
            throws IOException, InterruptedException {
        Files.createDirectories(outWav.getParent());
        List<String> cmd = List.of(
                props.getBinary(),
                "-y",
                "-ss", String.format(Locale.ROOT, "%.3f", Math.max(0, startSec)),
                "-t",  String.format(Locale.ROOT, "%.3f", Math.max(0.1, durationSec)),
                "-i",  src.toAbsolutePath().toString(),
                "-vn",
                "-ac", "1",
                "-ar", "16000",
                outWav.toAbsolutePath().toString()
        );
        Process p = spawn(new ProcessBuilder(cmd).redirectErrorStream(true));
        // stderr/stdout 不消费会顶住 ffmpeg 的 pipe。这里读成行只保留末尾 N 行，便于失败时定位
        // "Stream specifier matches no streams" / "Invalid data found" / "moov atom not found" 等根因。
        Deque<String> tail = new ArrayDeque<>();
        Thread drain = startTailDrain(p, tail, "ffmpeg-extract-out");
        try {
            if (!p.waitFor(120, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                p.descendants().forEach(ProcessHandle::destroyForcibly);
                throw new IOException("ffmpeg extract audio timeout: " + src + " | tail: " + tailToString(tail));
            }
            if (p.exitValue() != 0) {
                throw new IOException("ffmpeg extract audio exit " + p.exitValue() + ": " + src
                        + " | tail: " + tailToString(tail));
            }
        } finally {
            try { drain.join(500); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
        }
    }

    /**
     * 单条 ffmpeg 命令生成 N×M 九宫格 contact sheet。
     * 用 {@code fps=N/duration} 在视频时间轴上均匀抽 N=cols*rows 帧，再 scale+pad+tile 拼成
     * 一张 JPEG。不需要中间文件。
     *
     * @param src       源视频
     * @param durationS 源视频时长（已由调用方 ffprobe 得到）
     * @param cols      列数（如 3）
     * @param rows      行数（如 3）
     * @param cellW     每格宽（如 320）
     * @param cellH     每格高（如 180）
     * @param outJpg    输出 JPEG 路径
     * @param timeoutS  ffmpeg 进程硬超时
     */
    public void makeContactSheet(Path src, double durationS, int cols, int rows,
                                  int cellW, int cellH, Path outJpg, int timeoutS)
            throws IOException, InterruptedException {
        Files.createDirectories(outJpg.getParent());
        int n = Math.max(1, cols * rows);
        double safeDuration = Math.max(durationS, 0.001);
        // 均匀抽 n 帧：fps=n/duration（每 duration/n 秒一帧）
        // scale 保 aspect ratio + pad 居中（竖屏视频两侧补黑边而非拉伸）
        String vf = String.format(Locale.ROOT,
                "fps=%d/%.3f,scale=%d:%d:force_original_aspect_ratio=decrease,"
                        + "pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=black,tile=%dx%d",
                n, safeDuration, cellW, cellH, cellW, cellH, cols, rows);

        List<String> cmd = List.of(
                props.getBinary(),
                "-y",
                "-i", src.toAbsolutePath().toString(),
                "-vf", vf,
                "-frames:v", "1",
                "-q:v", "4",
                outJpg.toAbsolutePath().toString()
        );
        Process p = spawn(new ProcessBuilder(cmd).redirectErrorStream(true));
        Deque<String> tail = new ArrayDeque<>();
        Thread drain = startTailDrain(p, tail, "ffmpeg-grid-out");
        try {
            if (!p.waitFor(Math.max(1, timeoutS), TimeUnit.SECONDS)) {
                p.destroyForcibly();
                p.descendants().forEach(ProcessHandle::destroyForcibly);
                throw new IOException("contact sheet timeout: " + src + " | tail: " + tailToString(tail));
            }
            if (p.exitValue() != 0) {
                throw new IOException("ffmpeg contact sheet exit " + p.exitValue() + ": " + src
                        + " | tail: " + tailToString(tail));
            }
            if (!Files.isRegularFile(outJpg) || Files.size(outJpg) == 0) {
                throw new IOException("contact sheet produced empty output: " + src
                        + " | tail: " + tailToString(tail));
            }
        } finally {
            try { drain.join(500); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
        }
    }

    /**
     * concat demuxer 无损拼接（{@code -c copy}）。要求所有输入编码/容器/分辨率一致，否则部分
     * 播放器花屏，由调用方负责一致性判定。写一份临时 list.txt（每行 {@code file '<abs>'}）。
     */
    public void concatCopy(List<Path> inputs, Path out, int timeoutS)
            throws IOException, InterruptedException {
        Files.createDirectories(out.getParent());
        Path listFile = Files.createTempFile("kai-merge-", ".txt");
        try {
            StringBuilder sb = new StringBuilder();
            for (Path in : inputs) {
                // concat list 用单引号包裹，内部单引号转义为 '\''
                String abs = in.toAbsolutePath().toString().replace("'", "'\\''");
                sb.append("file '").append(abs).append("'\n");
            }
            Files.writeString(listFile, sb.toString(), StandardCharsets.UTF_8);
            List<String> cmd = List.of(
                    props.getBinary(), "-y",
                    "-f", "concat", "-safe", "0",
                    "-i", listFile.toAbsolutePath().toString(),
                    "-c", "copy",
                    out.toAbsolutePath().toString());
            runConcat(cmd, out, timeoutS, "ffmpeg-concat-copy");
        } finally {
            Files.deleteIfExists(listFile);
        }
    }

    /**
     * concat filter 重编码拼接：每路 scale+pad 到统一分辨率 + 统一帧率后 concat，软编 H.264。
     * {@code withAudio=true} 时每路重采样音频并输出 AAC；{@code false} 时输出无音轨
     * （用于含无音轨输入的混合场景，避免逐段补静音导致的 a 流数量不匹配）。
     */
    public void concatReencode(List<Path> inputs, Path out, String resolution, int fps,
                               boolean withAudio, int timeoutS)
            throws IOException, InterruptedException {
        Files.createDirectories(out.getParent());
        int n = inputs.size();
        String[] wh = resolution.toLowerCase(Locale.ROOT).split("x");
        int w = Integer.parseInt(wh[0].trim());
        int h = Integer.parseInt(wh[1].trim());

        List<String> cmd = new ArrayList<>();
        cmd.add(props.getBinary());
        cmd.add("-y");
        for (Path in : inputs) {
            cmd.add("-i");
            cmd.add(in.toAbsolutePath().toString());
        }

        StringBuilder fc = new StringBuilder();
        StringBuilder segs = new StringBuilder();
        for (int i = 0; i < n; i++) {
            fc.append(String.format(Locale.ROOT,
                    "[%d:v]scale=%d:%d:force_original_aspect_ratio=decrease,"
                            + "pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=%d[v%d];",
                    i, w, h, w, h, fps, i));
            segs.append("[v").append(i).append("]");
            if (withAudio) {
                fc.append(String.format(Locale.ROOT, "[%d:a]aresample=async=1[a%d];", i, i));
                segs.append("[a").append(i).append("]");
            }
        }
        fc.append(segs).append("concat=n=").append(n)
                .append(withAudio ? ":v=1:a=1[outv][outa]" : ":v=1:a=0[outv]");

        // 滤镜图写到脚本文件，用 -filter_complex_script 代替超长 -filter_complex：上百个输入拼出的
        // filtergraph 长达数万字符，直接放命令行会撑爆 Windows CreateProcess 的 ~32KB 上限（error=206）。
        Path filterScript = Files.createTempFile("kai-merge-fc-", ".txt");
        try {
            Files.writeString(filterScript, fc.toString(), StandardCharsets.UTF_8);
            cmd.add("-filter_complex_script");
            cmd.add(filterScript.toAbsolutePath().toString());
            cmd.add("-map");
            cmd.add("[outv]");
            if (withAudio) {
                cmd.add("-map");
                cmd.add("[outa]");
            }
            cmd.add("-c:v");
            cmd.add("libx264");
            cmd.add("-preset");
            cmd.add("veryfast");
            cmd.add("-crf");
            cmd.add("23");
            if (withAudio) {
                cmd.add("-c:a");
                cmd.add("aac");
                cmd.add("-b:a");
                cmd.add("128k");
            }
            cmd.add(out.toAbsolutePath().toString());

            runConcat(cmd, out, timeoutS, "ffmpeg-concat-reencode");
        } finally {
            Files.deleteIfExists(filterScript);
        }
    }

    /** copy/reencode 共用执行壳：沿用 spawn + tail 排空 + 超时强杀 + 退出码/空文件校验。 */
    private void runConcat(List<String> cmd, Path out, int timeoutS, String threadName)
            throws IOException, InterruptedException {
        Process p = spawn(new ProcessBuilder(cmd).redirectErrorStream(true));
        Deque<String> tail = new ArrayDeque<>();
        Thread drain = startTailDrain(p, tail, threadName);
        try {
            if (!p.waitFor(Math.max(1, timeoutS), TimeUnit.SECONDS)) {
                p.destroyForcibly();
                p.descendants().forEach(ProcessHandle::destroyForcibly);
                throw new IOException("video merge timeout | tail: " + tailToString(tail));
            }
            if (p.exitValue() != 0) {
                throw new IOException("ffmpeg merge exit " + p.exitValue() + " | tail: " + tailToString(tail));
            }
            if (!Files.isRegularFile(out) || Files.size(out) == 0) {
                throw new IOException("video merge produced empty output | tail: " + tailToString(tail));
            }
        } finally {
            try { drain.join(500); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
        }
    }

    @PreDestroy
    void onContextClose() {
        reapAll();
    }

    private void reapAll() {
        if (active.isEmpty()) return;
        int n = active.size();
        log.info("force-killing {} live ffmpeg/ffprobe processes on shutdown", n);
        for (Process p : active) {
            try {
                // Catches the rare case where the spawned binary itself forked helpers.
                p.descendants().forEach(ProcessHandle::destroyForcibly);
                p.destroyForcibly();
            } catch (Exception ignored) {
            }
        }
        active.clear();
    }
}
