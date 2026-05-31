package com.exceptioncoder.toolbox.downloader.service;

import com.exceptioncoder.toolbox.downloader.config.DownloaderProperties;
import com.exceptioncoder.toolbox.downloader.domain.DownloadSegment;
import com.exceptioncoder.toolbox.downloader.domain.DownloadTask;
import com.exceptioncoder.toolbox.downloader.domain.HttpEngineType;
import com.exceptioncoder.toolbox.downloader.domain.ProxyCandidate;
import com.exceptioncoder.toolbox.downloader.domain.RouteDecision;
import com.exceptioncoder.toolbox.downloader.domain.RouteType;
import com.exceptioncoder.toolbox.downloader.domain.SegmentState;
import com.exceptioncoder.toolbox.downloader.domain.DownloadTaskRepository;
import com.exceptioncoder.toolbox.downloader.domain.TaskState;
import com.exceptioncoder.toolbox.downloader.service.engine.EngineHeaders;
import com.exceptioncoder.toolbox.downloader.service.engine.HttpEngine;
import com.exceptioncoder.toolbox.downloader.service.engine.HttpEngineFactory;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.net.URI;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 下载任务编排器。状态机切换统一从 transitionTo 入口；并发更新通过 taskLock 行级锁串行化。
 */
@Service
public class DownloaderTaskService {

    private static final Logger log = LoggerFactory.getLogger(DownloaderTaskService.class);
    private static final Pattern CONTENT_RANGE_TOTAL = Pattern.compile("/(\\d+)\\s*$");

    /** 状态机合法转换表 */
    private static final Map<TaskState, Set<TaskState>> LEGAL_TRANSITIONS = new EnumMap<>(TaskState.class);
    static {
        LEGAL_TRANSITIONS.put(TaskState.QUEUED,      EnumSet.of(TaskState.PROBING, TaskState.PAUSED, TaskState.FAILED));
        LEGAL_TRANSITIONS.put(TaskState.PROBING,     EnumSet.of(TaskState.DOWNLOADING, TaskState.PAUSED, TaskState.FAILED));
        LEGAL_TRANSITIONS.put(TaskState.DOWNLOADING, EnumSet.of(TaskState.PAUSED, TaskState.COMPLETED, TaskState.FAILED));
        LEGAL_TRANSITIONS.put(TaskState.PAUSED,      EnumSet.of(TaskState.DOWNLOADING, TaskState.FAILED));
        LEGAL_TRANSITIONS.put(TaskState.COMPLETED,   EnumSet.noneOf(TaskState.class));
        // FAILED → QUEUED：用户点 resume 时重置任务，可换链路重试
        LEGAL_TRANSITIONS.put(TaskState.FAILED,      EnumSet.of(TaskState.QUEUED));
    }

    private final DownloaderProperties props;
    private final DownloadTaskRepository repo;
    private final ProxyDetector proxyDetector;
    private final RouteProber routeProber;
    private final SegmentDownloader segmentDownloader;
    private final HttpEngineFactory engineFactory;
    private final FilenameResolver filenameResolver;
    private final ProgressBus progressBus;

    /** 进程级 worker 执行器，虚拟线程，无大小上限；本工程在进程内统一靠 maxParallelGlobal 控制并发 */
    private final ExecutorService workerExecutor = Executors.newVirtualThreadPerTaskExecutor();

    /** 任务级锁，保证 transitionTo + 重排不与 worker 完成事件交错 */
    private final ConcurrentHashMap<Long, Object> taskLocks = new ConcurrentHashMap<>();

    /** 任务运行时上下文：worker future、暂停信号、HttpClient */
    private final ConcurrentHashMap<Long, RuntimeContext> runtimeContexts = new ConcurrentHashMap<>();

    public DownloaderTaskService(DownloaderProperties props,
                       DownloadTaskRepository repo,
                       ProxyDetector proxyDetector,
                       RouteProber routeProber,
                       SegmentDownloader segmentDownloader,
                       HttpEngineFactory engineFactory,
                       FilenameResolver filenameResolver,
                       ProgressBus progressBus) {
        this.props = props;
        this.repo = repo;
        this.proxyDetector = proxyDetector;
        this.routeProber = routeProber;
        this.segmentDownloader = segmentDownloader;
        this.engineFactory = engineFactory;
        this.filenameResolver = filenameResolver;
        this.progressBus = progressBus;
    }

    // ---------- public API ----------

    public DownloadTask create(String url, String savePath, String filename, HttpEngineType engineType) {
        URI uri = validateUrl(url);
        Path saveDir = validateSavePath(savePath);
        ensureDirectory(saveDir);

        Instant now = Instant.now();
        DownloadTask task = DownloadTask.builder()
                .url(uri.toString())
                .savePath(saveDir.toString())
                .filename(filename == null ? "pending" : filename) // kickoff 阶段再覆盖
                .totalSize(-1L)
                .acceptRanges(false)
                .httpEngine(engineType == null ? HttpEngineType.JDK : engineType)
                .state(TaskState.QUEUED)
                .createdAt(now)
                .updatedAt(now)
                .build();
        repo.insertTask(task);
        log.info("created download task {} url={}", task.getId(), task.getUrl());
        workerExecutor.submit(() -> safeKickoff(task.getId(), filename));
        return task;
    }

    public List<DownloadTask> listAll(Set<TaskState> filter, int limit) {
        return repo.listAll(filter, Math.max(1, Math.min(200, limit)));
    }

    public DownloadTask findById(long id) {
        return repo.findById(id).orElseThrow(() -> new TaskNotFoundException(id));
    }

    public DownloadTask pause(long id) {
        DownloadTask t = findById(id);
        synchronized (lockFor(id)) {
            if (t.getState() == TaskState.COMPLETED || t.getState() == TaskState.FAILED || t.getState() == TaskState.PAUSED) {
                return t;
            }
            transitionTo(id, TaskState.PAUSED, null);
            RuntimeContext ctx = runtimeContexts.get(id);
            if (ctx != null) ctx.shouldStop.set(true);
        }
        return findById(id);
    }

    public DownloadTask resume(long id) {
        DownloadTask t = findById(id);
        synchronized (lockFor(id)) {
            if (t.getState() == TaskState.DOWNLOADING || t.getState() == TaskState.PROBING) return t;
            if (t.getState() == TaskState.COMPLETED) {
                throw new TaskNotResumableException(t.getState());
            }
            if (t.getState() == TaskState.FAILED) {
                // 失败重试：把所有非 DONE 分片重置为 PENDING，attempts 清零，state 回 QUEUED 后重新 kickoff（重新探测链路）
                repo.listSegments(id).forEach(s -> {
                    if (s.getState() != SegmentState.DONE) {
                        s.setState(SegmentState.PENDING);
                        s.setAttempts(0);
                        s.setLastError(null);
                        repo.updateSegment(s);
                    }
                });
                transitionTo(id, TaskState.QUEUED, null);
                workerExecutor.submit(() -> safeKickoff(id, t.getFilename()));
                return findById(id);
            }
            if (t.getRouteType() == null) {
                // 之前没探测完，从头来
                workerExecutor.submit(() -> safeKickoff(id, t.getFilename()));
                return t;
            }
            // PAUSED 且已有 route，直接重新拉起 worker（断点续传）
            workerExecutor.submit(() -> resumeWorkers(id));
        }
        return findById(id);
    }

    public void delete(long id, boolean keepFile) {
        DownloadTask t = repo.findById(id).orElse(null);
        if (t == null) return;
        synchronized (lockFor(id)) {
            RuntimeContext ctx = runtimeContexts.remove(id);
            if (ctx != null) {
                ctx.shouldStop.set(true);
                ctx.futures.forEach(f -> f.cancel(true));
                closeQuietly(ctx.primaryEngine);
                closeQuietly(ctx.backupEngine);
            }
            if (!keepFile) {
                Path tmp = workingFile(t);
                try { Files.deleteIfExists(tmp); } catch (IOException ignored) { /* best-effort */ }
            }
            repo.deleteTask(id);
            progressBus.closeTask(id);
        }
    }

    // ---------- startup hook ----------

    @PostConstruct
    public void restoreOnStartup() {
        List<DownloadTask> stuck = repo.listAll(EnumSet.of(TaskState.PROBING, TaskState.DOWNLOADING), 200);
        for (DownloadTask t : stuck) {
            repo.updateTaskState(t.getId(), TaskState.PAUSED, "进程重启自动暂停");
            log.info("startup: task {} {} → PAUSED", t.getId(), t.getState());
        }
    }

    @PreDestroy
    public void shutdown() {
        runtimeContexts.values().forEach(ctx -> ctx.shouldStop.set(true));
        workerExecutor.shutdown();
    }

    // ---------- core orchestration ----------

    private void safeKickoff(long taskId, String userFilename) {
        try {
            kickoff(taskId, userFilename);
        } catch (Exception e) {
            log.warn("kickoff failed for task {}: {}", taskId, e.toString());
            failTask(taskId, e.getMessage());
        }
    }

    private void kickoff(long taskId, String userFilename) {
        DownloadTask t = findById(taskId);
        if (t.getState() == TaskState.PAUSED || t.getState().isTerminal()) return;

        HttpEngineType engineType = t.getHttpEngine() == null ? HttpEngineType.JDK : t.getHttpEngine();
        transitionTo(taskId, TaskState.PROBING, null);
        URI uri = URI.create(t.getUrl());
        Optional<ProxyCandidate> proxy = proxyDetector.effective();

        RouteProber.RaceResult race = routeProber.race(uri, proxy, engineType);
        RouteDecision decision = race.decision();
        EngineHeaders headers = race.winnerHeaders();

        long totalSize = parseTotalSize(headers);
        boolean acceptRanges = parseAcceptRanges(headers);
        String filename = filenameResolver.resolve(uri, headers, userFilename);

        // 同名规避：第一次创建任务时挑选最终路径
        Path target = filenameResolver.deduplicate(Paths.get(t.getSavePath()), filename);
        String finalName = target.getFileName().toString();

        repo.updateRouteDecision(taskId, decision);
        repo.updateTaskAfterProbe(taskId, totalSize, acceptRanges, finalName);

        // 预分配文件
        Path tmp = FilenameResolver.workingFile(target);
        if (totalSize > 0) {
            try (RandomAccessFile raf = new RandomAccessFile(tmp.toFile(), "rw")) {
                raf.setLength(totalSize);
            } catch (IOException e) {
                throw new RuntimeException("无法预分配临时文件：" + tmp + " - " + e.getMessage(), e);
            }
        } else {
            try {
                Files.createDirectories(tmp.getParent());
                if (!Files.exists(tmp)) Files.createFile(tmp);
            } catch (IOException e) {
                throw new RuntimeException("无法创建临时文件：" + tmp + " - " + e.getMessage(), e);
            }
        }

        // 切片
        List<DownloadSegment> segments = buildSegments(taskId, totalSize, acceptRanges);
        repo.insertSegments(segments);

        // 进入下载态：构造主备双 engine，单片失败时跨链路重试
        HttpEngine primary;
        RouteType primaryRoute = decision.route();
        HttpEngine backup = null;
        RouteType backupRoute = null;
        if (decision.route() == RouteType.PROXY) {
            primary = engineFactory.create(engineType, proxy);
            if (decision.directTtfbMs() != null) {
                backup = engineFactory.create(engineType, Optional.empty());
                backupRoute = RouteType.DIRECT;
            }
        } else {
            primary = engineFactory.create(engineType, Optional.empty());
            if (decision.proxyTtfbMs() != null && proxy.isPresent()) {
                backup = engineFactory.create(engineType, proxy);
                backupRoute = RouteType.PROXY;
            }
        }

        RuntimeContext ctx = new RuntimeContext(primary, primaryRoute, backup, backupRoute,
                props.getMaxParallelPerTask());
        runtimeContexts.put(taskId, ctx);

        transitionTo(taskId, TaskState.DOWNLOADING, null);
        progressBus.registerActive(taskId, repo.sumDownloadedBytes(taskId), totalSize);
        progressBus.publishRouteDecided(taskId, decision);

        dispatchSegments(taskId, uri, target, segments, ctx);
    }

    private void resumeWorkers(long taskId) {
        DownloadTask t = findById(taskId);
        if (t.getState() != TaskState.PAUSED && t.getState() != TaskState.QUEUED) return;

        HttpEngineType engineType = t.getHttpEngine() == null ? HttpEngineType.JDK : t.getHttpEngine();
        URI uri = URI.create(t.getUrl());
        // 恢复时按当时的 route 构造主 engine；备用 engine 重新探测一次系统代理（期间用户可能开/关 VPN）
        HttpEngine primary;
        HttpEngine backup = null;
        RouteType backupRoute = null;
        if (t.getRouteType() == RouteType.PROXY && t.getRouteProxy() != null) {
            primary = engineFactory.create(engineType, Optional.of(toCandidate(t.getRouteProxy())));
            backup = engineFactory.create(engineType, Optional.empty());
            backupRoute = RouteType.DIRECT;
        } else {
            primary = engineFactory.create(engineType, Optional.empty());
            Optional<ProxyCandidate> currentProxy = proxyDetector.effective();
            if (currentProxy.isPresent()) {
                backup = engineFactory.create(engineType, currentProxy);
                backupRoute = RouteType.PROXY;
            }
        }
        RuntimeContext ctx = new RuntimeContext(primary, t.getRouteType(), backup, backupRoute,
                props.getMaxParallelPerTask());
        runtimeContexts.put(taskId, ctx);

        Path target = Paths.get(t.getSavePath(), t.getFilename());
        List<DownloadSegment> segs = repo.listSegments(taskId)
                .stream()
                .filter(s -> s.getState() != SegmentState.DONE)
                .toList();
        if (segs.isEmpty()) {
            finalizeTask(taskId);
            return;
        }
        transitionTo(taskId, TaskState.DOWNLOADING, null);
        progressBus.registerActive(taskId, repo.sumDownloadedBytes(taskId), t.getTotalSize());
        dispatchSegments(taskId, uri, target, segs, ctx);
    }

    private void dispatchSegments(long taskId, URI url, Path finalPath, List<DownloadSegment> segs, RuntimeContext ctx) {
        Path tmp = FilenameResolver.workingFile(finalPath);
        for (DownloadSegment s : segs) {
            if (s.getState() == SegmentState.DONE) continue;
            Future<?> f = workerExecutor.submit(() -> runSegment(taskId, url, tmp, s, finalPath, ctx));
            ctx.futures.add(f);
        }
    }

    private void runSegment(long taskId, URI url, Path tmp, DownloadSegment seg, Path finalPath, RuntimeContext ctx) {
        // 自适应并发闸：失败率高时永久占住部分 permits，等价于降并发
        try {
            ctx.parallelGate.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return;
        }
        try (FileChannel fc = FileChannel.open(tmp, StandardOpenOption.WRITE, StandardOpenOption.READ)) {
            seg.setState(SegmentState.DOWNLOADING);
            repo.updateSegment(seg);
            progressBus.publishSegment(taskId, seg);

            int totalRetries = props.getSegmentRetryMax();
            int primaryRetries = ctx.backupEngine == null ? totalRetries : Math.max(1, totalRetries / 2);

            // Phase 1: primary client
            SegmentDownloader.SegmentOutcome outcome = segmentDownloader.download(
                    ctx.primaryEngine, url, seg, fc,
                    delta -> {
                        seg.setBytesDownloaded(seg.getBytesDownloaded() + delta);
                        progressBus.addBytes(taskId, delta);
                    },
                    ctx.shouldStop::get,
                    primaryRetries);

            // Phase 2: backup client（仅 primary FAILED 且任务未停 + 有 backup 时）
            if (outcome.state() == SegmentState.FAILED
                    && !ctx.shouldStop.get()
                    && ctx.backupEngine != null) {
                log.info("task {} seg {} primary({}) 失败，切换到 backup({}) 重试",
                        taskId, seg.getSeqNo(), ctx.primaryRoute, ctx.backupRoute);
                // 重置 attempts 让 backup 也能跑 totalRetries/2 次
                seg.setAttempts(0);
                seg.setLastError(null);
                outcome = segmentDownloader.download(
                        ctx.backupEngine, url, seg, fc,
                        delta -> {
                            seg.setBytesDownloaded(seg.getBytesDownloaded() + delta);
                            progressBus.addBytes(taskId, delta);
                        },
                        ctx.shouldStop::get,
                        totalRetries - primaryRetries);
            }

            seg.setState(outcome.state());
            seg.setAttempts(outcome.attemptsConsumed());
            seg.setLastError(outcome.error());
            repo.updateSegment(seg);
            progressBus.publishSegment(taskId, seg);

            // 记录到自适应窗口
            ctx.windowTotal.incrementAndGet();
            if (outcome.state() == SegmentState.FAILED) {
                ctx.windowFailed.incrementAndGet();
            }
            maybeAdaptParallelism(taskId, ctx);

            if (outcome.state() == SegmentState.DONE) {
                onSegmentDone(taskId, finalPath);
            } else if (outcome.state() == SegmentState.FAILED) {
                onSegmentFailed(taskId, outcome.error());
            }
        } catch (SegmentDownloader.HttpStatus429Exception e) {
            log.warn("task {} segment {} hit 429, mark PENDING and back off", taskId, seg.getSeqNo());
            seg.setState(SegmentState.PENDING);
            repo.updateSegment(seg);
            // 服务端明确限流 → 直接砍并发后重排
            shrinkParallel(ctx, Math.max(1, ctx.effectiveParallel.get() / 2), "HTTP 429");
            workerExecutor.submit(() -> {
                try { Thread.sleep(2000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
                if (ctx.shouldStop.get()) return;
                runSegment(taskId, url, tmp, seg, finalPath, ctx);
            });
        } catch (Exception e) {
            log.error("segment runner failed task {} seg {}: {}", taskId, seg.getSeqNo(), e.toString());
            seg.setState(SegmentState.FAILED);
            seg.setLastError(e.toString());
            repo.updateSegment(seg);
            onSegmentFailed(taskId, e.getMessage());
        } finally {
            ctx.parallelGate.release();
        }
    }

    /**
     * 自适应并发：每完成 4 片或失败 ≥2 片检查一次。
     * 失败率 > 50% 且当前并发 > 1 → 砍半并发，给服务端冷静一段时间。
     * 不主动加并发回去：保守优先，避免反复抖动。用户重新创建任务时会从默认并发开始。
     */
    private void maybeAdaptParallelism(long taskId, RuntimeContext ctx) {
        int total = ctx.windowTotal.get();
        int failed = ctx.windowFailed.get();
        if (total < 4 && failed < 2) return;
        long now = System.currentTimeMillis();
        if (now - ctx.lastAdaptAt < 10_000) return;  // 至少 10s 冷却
        ctx.lastAdaptAt = now;
        ctx.windowTotal.set(0);
        ctx.windowFailed.set(0);

        if (total == 0) return;
        double failRate = (double) failed / total;
        int current = ctx.effectiveParallel.get();
        if (failRate > 0.5 && current > 1) {
            shrinkParallel(ctx, Math.max(1, current / 2),
                    String.format("task %d 失败率 %.0f%% (%d/%d)", taskId, failRate * 100, failed, total));
        }
    }

    private void shrinkParallel(RuntimeContext ctx, int target, String reason) {
        int current = ctx.effectiveParallel.get();
        if (target >= current) return;
        int reduce = current - target;
        // 永久占住 reduce 个 permit（不再 release），等价于把信号量上限降到 target
        if (ctx.parallelGate.tryAcquire(reduce)) {
            ctx.effectiveParallel.set(target);
            log.info("自适应降并发：{} → {} ({})", current, target, reason);
        }
    }

    private void onSegmentDone(long taskId, Path finalPath) {
        maybeFinalize(taskId);
    }

    private void onSegmentFailed(long taskId, String error) {
        // 单片失败不直接拖整个任务下水：等所有兄弟片都到终态再判定。
        // 写库的 FAILED 状态已经由 runSegment 落了，这里只触发整体收尾检查。
        log.info("task {} got a FAILED segment ({}), 等待其他片走完后再决定整体状态", taskId, error);
        maybeFinalize(taskId);
    }

    /**
     * 检查任务整体是否可以收尾：
     * - 还有 PENDING / DOWNLOADING 片 → 不动，继续等
     * - 全部 DONE → finalizeTask
     * - 全部到终态（DONE / FAILED）且至少一个 FAILED → failTask（聚合失败原因）
     */
    private void maybeFinalize(long taskId) {
        synchronized (lockFor(taskId)) {
            DownloadTask t = repo.findById(taskId).orElse(null);
            if (t == null || t.getState().isTerminal()) return;
            // PAUSED 时不收尾：等用户继续；resume 会自己重新判定
            if (t.getState() == TaskState.PAUSED) return;

            List<DownloadSegment> all = repo.listSegments(taskId);
            boolean anyInFlight = all.stream()
                    .anyMatch(s -> s.getState() == SegmentState.PENDING || s.getState() == SegmentState.DOWNLOADING);
            if (anyInFlight) return;

            boolean anyFailed = all.stream().anyMatch(s -> s.getState() == SegmentState.FAILED);
            if (!anyFailed) {
                finalizeTask(taskId);
                return;
            }
            // 聚合失败原因：取第一条 FAILED 片的 lastError 作代表
            String reason = all.stream()
                    .filter(s -> s.getState() == SegmentState.FAILED)
                    .map(DownloadSegment::getLastError)
                    .filter(e -> e != null && !e.isBlank())
                    .findFirst()
                    .orElse("部分分片重试耗尽");
            long failedCount = all.stream().filter(s -> s.getState() == SegmentState.FAILED).count();
            failTask(taskId, failedCount + "/" + all.size() + " 片失败：" + reason);
        }
    }

    private void finalizeTask(long taskId) {
        DownloadTask t = findById(taskId);
        Path tmp = workingFile(t);
        Path target = Paths.get(t.getSavePath(), t.getFilename());
        try {
            if (Files.exists(tmp)) {
                Files.move(tmp, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            log.warn("rename {} → {} failed: {}", tmp, target, e.toString());
        }
        transitionTo(taskId, TaskState.COMPLETED, null);
        cleanupContext(taskId);
        progressBus.closeTask(taskId);
        log.info("task {} completed", taskId);
    }

    private void failTask(long taskId, String error) {
        try {
            transitionTo(taskId, TaskState.FAILED, error);
        } catch (IllegalStateException ignored) {
            // 终态已切换，忽略
        }
        // 关键：不立即 close HttpClient，避免把还在跑的 worker 全部炸成 IOException: closed 雪崩。
        // 只发暂停信号，等 worker 自然走完异常分支后由 cleanupContextAsync 异步清理。
        RuntimeContext ctx = runtimeContexts.get(taskId);
        if (ctx != null) ctx.shouldStop.set(true);
        progressBus.publishState(taskId, TaskState.FAILED, null, null, error);
        progressBus.closeTask(taskId);
        scheduleContextCleanup(taskId);
    }

    /**
     * 异步清理任务上下文：等所有 worker future 自然完成后再 close HttpClient。
     * worker 收到 shouldStop 信号后会在下一次 read 时退出，最多等几秒。
     */
    private void scheduleContextCleanup(long taskId) {
        workerExecutor.submit(() -> {
            RuntimeContext ctx = runtimeContexts.get(taskId);
            if (ctx == null) return;
            for (java.util.concurrent.Future<?> f : ctx.futures) {
                try { f.get(10, java.util.concurrent.TimeUnit.SECONDS); }
                catch (Exception ignored) { /* 超时/异常都不影响清理 */ }
            }
            cleanupContext(taskId);
        });
    }

    private void cleanupContext(long taskId) {
        RuntimeContext ctx = runtimeContexts.remove(taskId);
        if (ctx != null) {
            ctx.shouldStop.set(true);
            closeQuietly(ctx.primaryEngine);
            closeQuietly(ctx.backupEngine);
        }
        progressBus.deactivate(taskId);
    }

    // ---------- state machine ----------

    public void transitionTo(long id, TaskState next, String error) {
        synchronized (lockFor(id)) {
            DownloadTask t = repo.findById(id).orElseThrow(() -> new TaskNotFoundException(id));
            TaskState cur = t.getState();
            if (cur == next) return;
            Set<TaskState> allowed = LEGAL_TRANSITIONS.get(cur);
            if (allowed == null || !allowed.contains(next)) {
                throw new IllegalStateException("非法状态转换：" + cur + " → " + next);
            }
            repo.updateTaskState(id, next, error);
            progressBus.publishState(id, next,
                    t.getRouteType(), t.getRouteProxy(), error);
        }
    }

    // ---------- helpers ----------

    private List<DownloadSegment> buildSegments(long taskId, long totalSize, boolean acceptRanges) {
        List<DownloadSegment> segs = new ArrayList<>();
        if (totalSize <= 0 || !acceptRanges) {
            // 不支持 Range 或大小未知：单分片
            segs.add(DownloadSegment.builder()
                    .taskId(taskId).seqNo(0).offsetBytes(0)
                    .lengthBytes(Math.max(totalSize, 0))
                    .state(SegmentState.PENDING).build());
            return segs;
        }
        long segSize = Math.max(1, props.getSegmentSize());
        int seq = 0;
        long offset = 0;
        while (offset < totalSize) {
            long len = Math.min(segSize, totalSize - offset);
            segs.add(DownloadSegment.builder()
                    .taskId(taskId).seqNo(seq++)
                    .offsetBytes(offset).lengthBytes(len)
                    .state(SegmentState.PENDING).build());
            offset += len;
        }
        return segs;
    }

    private static long parseTotalSize(EngineHeaders headers) {
        Optional<String> contentRange = headers.firstValue("content-range");
        if (contentRange.isPresent()) {
            Matcher m = CONTENT_RANGE_TOTAL.matcher(contentRange.get());
            if (m.find()) return Long.parseLong(m.group(1));
        }
        return headers.firstValueAsLong("content-length").orElse(-1L);
    }

    private static boolean parseAcceptRanges(EngineHeaders headers) {
        if (headers.firstValue("content-range").isPresent()) return true;
        return headers.firstValue("accept-ranges")
                .map(v -> v.toLowerCase().contains("bytes"))
                .orElse(false);
    }

    private static Path workingFile(DownloadTask t) {
        return FilenameResolver.workingFile(Paths.get(t.getSavePath(), t.getFilename()));
    }

    private Object lockFor(long id) {
        return taskLocks.computeIfAbsent(id, k -> new Object());
    }

    private static URI validateUrl(String url) {
        if (url == null || url.isBlank()) {
            throw new IllegalArgumentException("url 不能为空");
        }
        URI uri;
        try {
            uri = URI.create(url.trim());
        } catch (Exception e) {
            throw new IllegalArgumentException("url 不是合法的 URI：" + e.getMessage());
        }
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            throw new IllegalArgumentException("url 必须以 http(s):// 开头");
        }
        if (uri.getHost() == null) {
            throw new IllegalArgumentException("url 缺少主机名");
        }
        return uri;
    }

    private Path validateSavePath(String savePath) {
        if (savePath == null || savePath.isBlank()) {
            String def = props.getDefaultSavePath();
            if (def == null || def.isBlank()) {
                def = System.getProperty("user.home") + "/Downloads/kai-toolbox";
            }
            return Paths.get(def);
        }
        Path p = Paths.get(savePath);
        String normalized = p.toAbsolutePath().normalize().toString().toLowerCase();
        // 极简黑名单：拒绝写入典型系统目录
        String[] blocked = {
                "c:\\windows", "c:\\program files", "c:\\program files (x86)",
                "/etc", "/usr", "/bin", "/sbin", "/system"
        };
        for (String b : blocked) {
            if (normalized.startsWith(b.toLowerCase())) {
                throw new IllegalArgumentException("savePath 不允许写入系统目录：" + savePath);
            }
        }
        return p;
    }

    private static void ensureDirectory(Path dir) {
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            throw new IllegalArgumentException("无法创建保存目录：" + dir + " - " + e.getMessage());
        }
    }

    private static ProxyCandidate toCandidate(String originUrl) {
        URI u = URI.create(originUrl);
        return new ProxyCandidate(ProxyCandidate.Source.TOOLBOX_CONFIG,
                u.getScheme() == null ? "http" : u.getScheme(),
                u.getHost(), u.getPort(), originUrl);
    }

    private static void closeQuietly(HttpEngine engine) {
        if (engine == null) return;
        try {
            engine.close();
        } catch (Exception ignored) {
            // best-effort
        }
    }

    /**
     * 任务级运行时上下文，仅在 DOWNLOADING/PROBING 期间存活。
     *
     * - primaryEngine: race 胜方链路；分片首选
     * - backupEngine: 备用链路（如另一侧 race 也成功）；primary 失败后单片切换重试
     * - parallelGate: 并发闸；自适应并发降并发就是「永久占用」一部分 permits
     */
    private static class RuntimeContext {
        final HttpEngine primaryEngine;
        final HttpEngine backupEngine;             // 可为 null
        final RouteType primaryRoute;
        final RouteType backupRoute;               // 可为 null
        final AtomicBoolean shouldStop = new AtomicBoolean(false);
        final List<Future<?>> futures = new java.util.concurrent.CopyOnWriteArrayList<>();
        final java.util.concurrent.Semaphore parallelGate;
        final java.util.concurrent.atomic.AtomicInteger effectiveParallel;
        // 自适应并发：最近窗口失败 / 完成计数
        final java.util.concurrent.atomic.AtomicInteger windowFailed =
                new java.util.concurrent.atomic.AtomicInteger();
        final java.util.concurrent.atomic.AtomicInteger windowTotal =
                new java.util.concurrent.atomic.AtomicInteger();
        volatile long lastAdaptAt = 0;

        RuntimeContext(HttpEngine primary, RouteType primaryRoute,
                       HttpEngine backup, RouteType backupRoute,
                       int parallel) {
            this.primaryEngine = Objects.requireNonNull(primary);
            this.primaryRoute = primaryRoute;
            this.backupEngine = backup;
            this.backupRoute = backupRoute;
            this.parallelGate = new java.util.concurrent.Semaphore(parallel);
            this.effectiveParallel = new java.util.concurrent.atomic.AtomicInteger(parallel);
        }
    }

    // ---------- exceptions（自带 @ResponseStatus，Spring 自动映射 HTTP 码） ----------

    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NOT_FOUND)
    public static class TaskNotFoundException extends RuntimeException {
        public TaskNotFoundException(long id) { super("task not found: " + id); }
    }

    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.CONFLICT)
    public static class TaskNotResumableException extends RuntimeException {
        public TaskNotResumableException(TaskState state) {
            super("任务当前状态不可恢复：" + state);
        }
    }
}
