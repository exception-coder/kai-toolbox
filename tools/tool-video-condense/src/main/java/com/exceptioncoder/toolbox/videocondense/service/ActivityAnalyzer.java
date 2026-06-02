package com.exceptioncoder.toolbox.videocondense.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProcessRegistry;
import com.exceptioncoder.toolbox.common.media.FfmpegProperties;
import com.exceptioncoder.toolbox.videocondense.config.VideoCondenseProperties;
import com.exceptioncoder.toolbox.videocondense.domain.ActivitySample;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.DoubleConsumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 整帧活动度分析：一次 ffmpeg 抽帧（低分辨率低 fps）算 scene 变化分 + freezedetect 静止区间，
 * 结果写到 jobDir/activity.txt（metadata=print）后解析。严格遵循子进程编排铁律：
 * 单线程 drain（redirectErrorStream 合流）+ 主线程 waitFor + destroyForcibly + 硬超时。
 */
@Service
public class ActivityAnalyzer {

    private static final Logger log = LoggerFactory.getLogger(ActivityAnalyzer.class);
    private static final String META_FILE = "activity.txt";
    private static final double FREEZE_MIN_SECONDS = 2.0;
    private static final String FREEZE_NOISE = "-60dB";
    private static final int STDERR_TAIL_LINES = 40;

    private static final Pattern P_PTS_TIME = Pattern.compile("pts_time:([-\\d.]+)");
    private static final Pattern P_SCENE = Pattern.compile("lavfi\\.scene_score=([-\\d.eE]+)");
    private static final Pattern P_FREEZE_START = Pattern.compile("lavfi\\.freezedetect\\.freeze_start=([-\\d.]+)");
    private static final Pattern P_FREEZE_END = Pattern.compile("lavfi\\.freezedetect\\.freeze_end=([-\\d.]+)");
    private static final Pattern P_PROGRESS_TIME = Pattern.compile("time=(\\d+):(\\d+):([\\d.]+)");

    private final FfmpegProperties ffmpeg;
    private final FfmpegProcessRegistry registry;
    private final VideoCondenseProperties props;

    public ActivityAnalyzer(FfmpegProperties ffmpeg, FfmpegProcessRegistry registry, VideoCondenseProperties props) {
        this.ffmpeg = ffmpeg;
        this.registry = registry;
        this.props = props;
    }

    public record AnalyzeResult(List<ActivitySample> samples, List<double[]> freezes) {}

    /**
     * @param input      源视频
     * @param jobDir     作业目录（metadata 文件落此），调用方保证已建
     * @param durationS  原片时长（秒），用于进度估算；未知传 0
     * @param onProgress 进度回调（0~1），可为 null
     * @param onStart    spawn 后回调出 Process，供调用方取消时强杀，可为 null
     */
    public AnalyzeResult analyze(Path input, Path jobDir, double durationS,
                                 DoubleConsumer onProgress, Consumer<Process> onStart)
            throws IOException, InterruptedException {
        Files.createDirectories(jobDir);
        String vf = String.format(
                "fps=%d,scale=%s,freezedetect=n=%s:d=%s,select='gte(scene,0)',metadata=print:file=%s",
                props.getSampleFps(), props.getSampleScale(), FREEZE_NOISE,
                trimNum(FREEZE_MIN_SECONDS), META_FILE);

        List<String> cmd = List.of(
                ffmpeg.getBinary(), "-hide_banner",
                "-i", input.toAbsolutePath().toString(),
                "-an", "-vf", vf,
                "-f", "null", "-");

        Process p = registry.spawn(new ProcessBuilder(cmd).directory(jobDir.toFile()).redirectErrorStream(true));
        if (onStart != null) onStart.accept(p);
        Deque<String> tail = new ArrayDeque<>();
        Thread drain = startProgressDrain(p, tail, durationS, onProgress);
        try {
            if (!p.waitFor(props.getAnalyzeTimeoutSeconds(), TimeUnit.SECONDS)) {
                p.descendants().forEach(ProcessHandle::destroyForcibly);
                p.destroyForcibly();
                throw new IOException("分析超时（" + props.getAnalyzeTimeoutSeconds() + "s）| " + tailToString(tail));
            }
            if (p.exitValue() != 0) {
                throw new IOException("ffmpeg 分析失败 exit " + p.exitValue() + " | " + tailToString(tail));
            }
        } finally {
            try { drain.join(500); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
        }
        return parseMetadata(jobDir.resolve(META_FILE), durationS);
    }

    private Thread startProgressDrain(Process p, Deque<String> tail, double durationS, DoubleConsumer onProgress) {
        return Thread.ofVirtual().name("vc-analyze-drain").start(() -> {
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    synchronized (tail) {
                        tail.addLast(line);
                        while (tail.size() > STDERR_TAIL_LINES) tail.pollFirst();
                    }
                    if (onProgress != null && durationS > 0) {
                        Matcher m = P_PROGRESS_TIME.matcher(line);
                        if (m.find()) {
                            double sec = Integer.parseInt(m.group(1)) * 3600.0
                                    + Integer.parseInt(m.group(2)) * 60.0
                                    + Double.parseDouble(m.group(3));
                            onProgress.accept(Math.min(1.0, sec / durationS));
                        }
                    }
                }
            } catch (IOException ignored) {
            }
        });
    }

    private AnalyzeResult parseMetadata(Path metaFile, double durationS) throws IOException {
        List<ActivitySample> samples = new ArrayList<>();
        List<double[]> freezes = new ArrayList<>();
        if (!Files.isRegularFile(metaFile)) {
            log.warn("[video-condense] 分析未产出 metadata 文件：{}", metaFile);
            return new AnalyzeResult(samples, freezes);
        }
        double curTime = 0;
        Double freezeStart = null;
        try (BufferedReader r = Files.newBufferedReader(metaFile, StandardCharsets.UTF_8)) {
            String line;
            while ((line = r.readLine()) != null) {
                Matcher mt = P_PTS_TIME.matcher(line);
                if (mt.find()) { curTime = parseSafe(mt.group(1), curTime); continue; }
                Matcher ms = P_SCENE.matcher(line);
                if (ms.find()) { samples.add(new ActivitySample(curTime, clamp01(parseSafe(ms.group(1), 0)))); continue; }
                Matcher mfs = P_FREEZE_START.matcher(line);
                if (mfs.find()) { freezeStart = parseSafe(mfs.group(1), curTime); continue; }
                Matcher mfe = P_FREEZE_END.matcher(line);
                if (mfe.find() && freezeStart != null) {
                    freezes.add(new double[]{freezeStart, parseSafe(mfe.group(1), curTime)});
                    freezeStart = null;
                }
            }
        }
        if (freezeStart != null) {
            freezes.add(new double[]{freezeStart, durationS > 0 ? durationS : curTime});
        }
        return new AnalyzeResult(samples, freezes);
    }

    private static double clamp01(double v) {
        return v < 0 ? 0 : Math.min(1.0, v);
    }

    private static double parseSafe(String s, double fallback) {
        try { return Double.parseDouble(s); } catch (NumberFormatException e) { return fallback; }
    }

    private static String trimNum(double d) {
        return d == Math.rint(d) ? String.valueOf((long) d) : String.valueOf(d);
    }

    private static String tailToString(Deque<String> tail) {
        synchronized (tail) {
            return tail.isEmpty() ? "<no output>" : String.join(" | ", tail);
        }
    }
}
