package com.exceptioncoder.toolbox.videocondense.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProbe;
import com.exceptioncoder.toolbox.common.media.FfmpegUnavailableException;
import com.exceptioncoder.toolbox.common.media.ProbeResult;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.videocondense.api.dto.JobView;
import com.exceptioncoder.toolbox.videocondense.api.dto.SegmentView;
import com.exceptioncoder.toolbox.videocondense.config.VideoCondenseProperties;
import com.exceptioncoder.toolbox.videocondense.domain.CondenseJob;
import com.exceptioncoder.toolbox.videocondense.domain.JobStatus;
import com.exceptioncoder.toolbox.videocondense.domain.RenderSegment;
import com.exceptioncoder.toolbox.videocondense.domain.Segment;
import com.exceptioncoder.toolbox.videocondense.repository.CondenseJobRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

/**
 * 视频智能变速作业编排核心：两阶段（analyze → 等微调 → render）异步流水 + 状态机 + per-job SSE。
 * analyze 产曲线停在 ANALYZED；render 吃前端回传曲线直接渲。所有 ffmpeg 走子进程铁律，取消即强杀。
 */
@Service
public class CondenseJobService {

    private static final Logger log = LoggerFactory.getLogger(CondenseJobService.class);
    private static final String SSE_EVENT = "progress";

    private final FfmpegProbe probe;
    private final ActivityAnalyzer analyzer;
    private final SegmentScorer scorer;
    private final SpeedCurveGenerator generator;
    private final FfmpegRenderService renderService;
    private final CondenseJobRepository repo;
    private final SseEmitterRegistry sse;
    private final VideoCondenseProperties props;
    private final ObjectMapper mapper;

    private final ConcurrentHashMap<String, JobRuntime> runtimes = new ConcurrentHashMap<>();

    public CondenseJobService(FfmpegProbe probe, ActivityAnalyzer analyzer, SegmentScorer scorer,
                              SpeedCurveGenerator generator, FfmpegRenderService renderService,
                              CondenseJobRepository repo, SseEmitterRegistry sse,
                              VideoCondenseProperties props, ObjectMapper mapper) {
        this.probe = probe;
        this.analyzer = analyzer;
        this.scorer = scorer;
        this.generator = generator;
        this.renderService = renderService;
        this.repo = repo;
        this.sse = sse;
        this.props = props;
        this.mapper = mapper;
    }

    @PostConstruct
    void cleanupOnStart() {
        int n = repo.cleanupStaleRunning(System.currentTimeMillis());
        if (n > 0) log.info("[video-condense] 启动清理 {} 个残留运行态作业", n);
    }

    // ============================ analyze 阶段 ============================

    public String analyze(String path) {
        if (!probe.isFfmpegAvailable()) {
            throw new FfmpegUnavailableException("FFmpeg 不可用，请在 application.yml 配置 toolbox.ffmpeg.binary");
        }
        Path input = resolveInput(path);
        String jobId = UUID.randomUUID().toString().substring(0, 8);
        long now = System.currentTimeMillis();
        repo.insert(new CondenseJob(jobId, input.toAbsolutePath().toString(),
                JobStatus.PENDING, null, null, null, now, now));
        runtimes.put(jobId, new JobRuntime());
        cleanStaleWorkDirs();
        Thread.ofVirtual().name("vc-analyze-" + jobId).start(() -> runAnalyze(jobId, input));
        return jobId;
    }

    private void runAnalyze(String jobId, Path input) {
        JobRuntime rt = runtimes.get(jobId);
        try {
            setStatus(jobId, JobStatus.ANALYZING, null);
            ProbeResult info = probe.probe(input);
            double dur = info.durationSeconds();
            Path jobDir = jobDir(jobId);
            ActivityAnalyzer.AnalyzeResult ar = analyzer.analyze(input, jobDir, dur,
                    prog -> { if (rt != null) rt.progress = prog; publish(jobId); },
                    proc -> { if (rt != null) rt.process.set(proc); });
            List<Segment> segs = generator.assignSpeeds(
                    scorer.score(ar.samples(), ar.freezes(), dur, props), props);
            String curveJson = mapper.writeValueAsString(toViews(segs));
            if (rt != null) rt.progress = 1.0;
            repo.updateCurve(jobId, dur > 0 ? dur : null, curveJson, JobStatus.ANALYZED, System.currentTimeMillis());
            publish(jobId);
        } catch (Exception e) {
            finishError(jobId, rt, e);
        }
    }

    // ============================ render 阶段 ============================

    public JobView render(String jobId, List<SegmentView> segments, String musicPath) throws NoSuchFileException {
        CondenseJob job = mustFind(jobId);
        if (job.status() != JobStatus.ANALYZED) {
            throw new IllegalArgumentException("作业未就绪（需 ANALYZED，当前 " + job.status() + "）");
        }
        List<RenderSegment> base = toRenderSegments(segments);
        Path music = resolveMusic(musicPath);
        Path input = Path.of(job.inputPath());

        JobRuntime rt = runtimes.computeIfAbsent(jobId, k -> new JobRuntime());
        rt.progress = 0;
        rt.cancelled = false;
        setStatus(jobId, JobStatus.RENDERING, null);
        Thread.ofVirtual().name("vc-render-" + jobId).start(() -> runRender(jobId, input, base, music));
        return view(jobId);
    }

    private void runRender(String jobId, Path input, List<RenderSegment> base, Path music) {
        JobRuntime rt = runtimes.get(jobId);
        try {
            List<RenderSegment> curve = generator.applyRamp(base, props);
            renderService.render(input, curve, music, jobDir(jobId),
                    proc -> { if (rt != null) rt.process.set(proc); });
            if (rt != null) rt.progress = 1.0;
            setStatus(jobId, JobStatus.DONE, null);
        } catch (Exception e) {
            finishError(jobId, rt, e);
        }
    }

    // ============================ 查询 / 取消 / SSE / 产物 ============================

    public JobView getJob(String jobId) throws NoSuchFileException {
        mustFind(jobId);
        return view(jobId);
    }

    public List<JobView> recent(int limit) {
        List<JobView> out = new ArrayList<>();
        for (CondenseJob j : repo.findRecent(limit)) {
            out.add(toView(j));
        }
        return out;
    }

    /** 取消：强杀在跑的 ffmpeg 并标 CANCELLED；已终态则幂等返回当前状态。 */
    public JobView cancel(String jobId) throws NoSuchFileException {
        CondenseJob job = mustFind(jobId);
        JobRuntime rt = runtimes.get(jobId);
        if (rt != null) {
            rt.cancelled = true;
            Process pr = rt.process.get();
            if (pr != null) {
                pr.descendants().forEach(ProcessHandle::destroyForcibly);
                pr.destroyForcibly();
            }
        }
        if (!job.status().isTerminal()) {
            setStatus(jobId, JobStatus.CANCELLED, null);
        }
        return view(jobId);
    }

    /** 注册 SSE 并立即回推当前快照，避免订阅瞬间错过状态。 */
    public SseEmitter events(String jobId) throws NoSuchFileException {
        mustFind(jobId);
        SseEmitter emitter = sse.create(jobId);
        publish(jobId);
        return emitter;
    }

    /** 解析并校验 DONE 作业产物路径，做越权防护。 */
    public Path resolveArtifact(String jobId) throws NoSuchFileException {
        CondenseJob job = mustFind(jobId);
        if (job.status() != JobStatus.DONE) {
            throw new NoSuchFileException(jobId + "/out.mp4");
        }
        Path dir = jobDir(jobId).toAbsolutePath().normalize();
        Path out = dir.resolve("out.mp4").normalize();
        if (!out.startsWith(dir) || !Files.isRegularFile(out)) {
            throw new NoSuchFileException(jobId + "/out.mp4");
        }
        return out;
    }

    // ============================ 内部 ============================

    private void setStatus(String jobId, JobStatus status, String error) {
        repo.updateStatus(jobId, status, error, System.currentTimeMillis());
        publish(jobId);
    }

    private void finishError(String jobId, JobRuntime rt, Exception e) {
        if (e instanceof InterruptedException) Thread.currentThread().interrupt();
        boolean cancelled = rt != null && rt.cancelled;
        if (cancelled) {
            setStatus(jobId, JobStatus.CANCELLED, null);
            log.info("[video-condense] 作业 {} 已取消", jobId);
        } else {
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            setStatus(jobId, JobStatus.FAILED, msg);
            log.warn("[video-condense] 作业 {} 失败：{}", jobId, msg);
        }
    }

    private void publish(String jobId) {
        JobView v = view(jobId);
        if (v == null) return;
        sse.publish(jobId, SSE_EVENT, v);
        if (JobStatus.valueOf(v.status()).isTerminal()) {
            sse.complete(jobId);
        }
    }

    private JobView view(String jobId) {
        return repo.findById(jobId).map(this::toView).orElse(null);
    }

    private JobView toView(CondenseJob job) {
        JobRuntime rt = runtimes.get(job.id());
        double progress = rt != null ? rt.progress
                : (job.status() == JobStatus.DONE || job.status() == JobStatus.ANALYZED ? 1.0 : 0.0);
        return new JobView(job.id(), job.status().name(), job.inputPath(), job.durationSec(),
                progress, parseCurve(job.curveJson()), job.error());
    }

    private CondenseJob mustFind(String jobId) throws NoSuchFileException {
        CondenseJob job = repo.findById(jobId).orElse(null);
        if (job == null) throw new NoSuchFileException(jobId);
        return job;
    }

    private Path resolveInput(String path) {
        if (path == null || path.isBlank()) throw new IllegalArgumentException("path 不能为空");
        Path f = Path.of(path).normalize();
        if (!Files.isRegularFile(f)) throw new IllegalArgumentException("文件不存在或非常规文件: " + path);
        return f;
    }

    private Path resolveMusic(String musicPath) {
        if (musicPath == null || musicPath.isBlank()) return null;
        Path m = Path.of(musicPath).normalize();
        if (!Files.isRegularFile(m)) throw new IllegalArgumentException("musicPath 非法路径: " + musicPath);
        return m;
    }

    /** 校验并转换前端回传曲线：speed>0、end>start、按 start 升序且不重叠（gap 允许，渲染时剔除）。 */
    private List<RenderSegment> toRenderSegments(List<SegmentView> segments) {
        if (segments == null || segments.isEmpty()) {
            throw new IllegalArgumentException("segments 不能为空");
        }
        List<SegmentView> sorted = new ArrayList<>(segments);
        sorted.sort(Comparator.comparingDouble(SegmentView::start));
        List<RenderSegment> out = new ArrayList<>(sorted.size());
        double prevEnd = Double.NEGATIVE_INFINITY;
        for (SegmentView s : sorted) {
            if (s.speed() <= 0) throw new IllegalArgumentException("speed 必须 > 0");
            if (s.end() <= s.start()) throw new IllegalArgumentException("段区间非法: " + s.start() + "~" + s.end());
            if (s.start() < prevEnd - 1e-6) throw new IllegalArgumentException("段区间重叠");
            out.add(new RenderSegment(s.start(), s.end(), s.speed()));
            prevEnd = s.end();
        }
        return out;
    }

    private List<SegmentView> toViews(List<Segment> segs) {
        List<SegmentView> out = new ArrayList<>(segs.size());
        for (Segment s : segs) {
            out.add(new SegmentView(s.start(), s.end(), s.speed(), s.type().name(), s.score()));
        }
        return out;
    }

    private List<SegmentView> parseCurve(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return mapper.readValue(json, new TypeReference<List<SegmentView>>() {});
        } catch (IOException e) {
            log.warn("[video-condense] 解析 curve_json 失败：{}", e.getMessage());
            return List.of();
        }
    }

    private Path jobDir(String jobId) {
        return Path.of(props.getWorkDir(), jobId);
    }

    private void cleanStaleWorkDirs() {
        Path root = Path.of(props.getWorkDir());
        if (!Files.isDirectory(root)) return;
        long cutoff = System.currentTimeMillis() - props.getRetainMinutes() * 60_000L;
        try (Stream<Path> children = Files.list(root)) {
            children.filter(Files::isDirectory)
                    .filter(d -> lastModified(d) < cutoff)
                    .forEach(this::deleteRecursively);
        } catch (IOException e) {
            log.warn("[video-condense] 清理过期 workDir 失败：{}", e.toString());
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
            log.warn("[video-condense] 删除 workDir 子目录失败 {}：{}", dir, e.toString());
        }
    }

    /** 单作业内存运行态：进度、取消标记、当前在跑的 ffmpeg 进程。 */
    private static final class JobRuntime {
        volatile double progress;
        volatile boolean cancelled;
        final AtomicReference<Process> process = new AtomicReference<>();
    }
}
