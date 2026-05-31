package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.treesize.domain.ProcessingJob;
import com.exceptioncoder.toolbox.treesize.domain.ProcessingJobStatus;
import com.exceptioncoder.toolbox.treesize.domain.ProcessingJobType;
import com.exceptioncoder.toolbox.treesize.repository.ProcessingJobRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/**
 * 视频处理任务统一调度抽象。语言识别 / 九宫格 / 时长 / 名称归类 / 人物年龄 / 嵌入 / 聚类
 * 七类任务通过 {@link #startJob(ProcessingJobType, Consumer)} 共用同一套生命周期：
 * <ol>
 *   <li>原子检查：同一种 type 同时只能一个 RUNNING；存在则拒绝（返回 Optional.empty）</li>
 *   <li>建 job 行 → 起 virtual thread 跑 workerLoop</li>
 *   <li>worker 通过 {@link JobContext#cancelled()} 检查取消标志</li>
 *   <li>每完成 1 个视频通过 {@link #recordSuccess(JobContext, String)} /
 *       {@link #recordFailure(JobContext, String, String)} 上报，自动广播 SSE</li>
 *   <li>worker 退出循环后自动 finish（DONE / CANCELLED / FAILED）</li>
 * </ol>
 *
 * <p>SSE 复用项目级 {@link SseEmitterRegistry}，按 jobId 作 key —— 前端订阅时先调
 * {@code /status} 拿当前 RUNNING 任务的 jobId，再用 jobId 订阅 {@code /events}。
 *
 * <p>启动时清理：{@link ProcessingJobRepository#cleanupStaleRunning} 把上次崩溃残留的
 * RUNNING 行（finished_at IS NULL）一次性置为 FAILED，避免幽灵任务挡住 startJob。
 */
@Service
public class VideoProcessingJobService {

    private static final Logger log = LoggerFactory.getLogger(VideoProcessingJobService.class);

    private final ProcessingJobRepository jobRepo;
    private final SseEmitterRegistry sse;

    /** type → 当前 RUNNING 任务的 handle。RUNNING 结束（DONE/CANCELLED/FAILED）后从 map 移除。 */
    private final ConcurrentHashMap<ProcessingJobType, JobHandle> running = new ConcurrentHashMap<>();

    public VideoProcessingJobService(ProcessingJobRepository jobRepo, SseEmitterRegistry sse) {
        this.jobRepo = jobRepo;
        this.sse = sse;
    }

    @PostConstruct
    public void cleanupStaleOnStartup() {
        int n = jobRepo.cleanupStaleRunning(System.currentTimeMillis());
        if (n > 0) log.info("processing-job: marked {} stale RUNNING rows as FAILED on startup", n);
    }

    /**
     * 启动任务。若已有同类型 RUNNING 返回 {@code Optional.empty()}（调用方应回 409）；
     * 否则建 job 行 + 起 virtual thread，返回 jobId。
     */
    public Optional<String> startJob(ProcessingJobType type, Consumer<JobContext> workerLoop) {
        // 双层保护：内存 map 先快路径；通过后再查库（防止重启后 map 空但库有残留）
        if (running.containsKey(type)) return Optional.empty();
        if (jobRepo.findRunning(type).isPresent()) {
            log.warn("processing-job: {} already RUNNING in DB but not in memory map — likely race", type);
            return Optional.empty();
        }

        long now = System.currentTimeMillis();
        String jobId = jobRepo.insertRunning(type, now);
        AtomicBoolean cancelled = new AtomicBoolean(false);
        JobContext ctx = new JobContext(jobId, type, cancelled);

        Thread worker = Thread.ofVirtual()
                .name("proc-job-" + type.name().toLowerCase())
                .unstarted(() -> runWorker(ctx, workerLoop));
        JobHandle handle = new JobHandle(jobId, cancelled, worker);
        running.put(type, handle);
        worker.start();
        log.info("processing-job: started type={} jobId={}", type, jobId);
        return Optional.of(jobId);
    }

    public void cancelJob(ProcessingJobType type) {
        JobHandle h = running.get(type);
        if (h == null) return;
        h.cancelled().set(true);
        log.info("processing-job: cancel requested type={} jobId={}", type, h.jobId());
    }

    public Optional<ProcessingJob> getLatest(ProcessingJobType type) {
        return jobRepo.findLatest(type);
    }

    public Optional<ProcessingJob> getRunning(ProcessingJobType type) {
        return jobRepo.findRunning(type);
    }

    /**
     * SSE 订阅。前端通常先 /status 拿当前 RUNNING 任务 jobId，再调本方法订阅。
     * 若已无 RUNNING 任务（任务刚结束），返回的 emitter 会在 1h 超时后自然关闭。
     */
    public SseEmitter subscribe(ProcessingJobType type) {
        Optional<ProcessingJob> running = jobRepo.findRunning(type);
        if (running.isPresent()) {
            return sse.create(running.get().id());
        }
        // 没有 RUNNING：给最近一次的 jobId（前端能立刻收到 done 然后关闭）
        Optional<ProcessingJob> latest = jobRepo.findLatest(type);
        String key = latest.map(ProcessingJob::id).orElse("processing-job:" + type.name());
        return sse.create(key);
    }

    // ---------- worker 侧 API ----------

    public void setTotal(JobContext ctx, long total) {
        jobRepo.updateTotal(ctx.jobId(), total);
        publish(ctx, "init", new InitEvent(ctx.jobId(), total));
    }

    public void recordSuccess(JobContext ctx, String videoPath) {
        jobRepo.recordSuccess(ctx.jobId(), videoPath);
        publish(ctx, "progress", buildProgressView(ctx));
    }

    public void recordFailure(JobContext ctx, String videoPath, String errorMsg) {
        jobRepo.recordFailure(ctx.jobId(), videoPath, errorMsg);
        publish(ctx, "progress", buildProgressView(ctx));
    }

    private ProcessingJob buildProgressView(JobContext ctx) {
        return jobRepo.findById(ctx.jobId()).orElseThrow();
    }

    private void publish(JobContext ctx, String event, Object payload) {
        sse.publish(ctx.jobId(), event, payload);
    }

    // ---------- 内部：worker 执行壳 ----------

    private void runWorker(JobContext ctx, Consumer<JobContext> workerLoop) {
        ProcessingJobStatus terminal = ProcessingJobStatus.DONE;
        String terminalErr = null;
        try {
            workerLoop.accept(ctx);
            if (ctx.cancelled().get()) terminal = ProcessingJobStatus.CANCELLED;
        } catch (Exception e) {
            log.error("processing-job: worker failed type={} jobId={}", ctx.type(), ctx.jobId(), e);
            terminal = ProcessingJobStatus.FAILED;
            terminalErr = e.getClass().getSimpleName() + ": " + (e.getMessage() == null ? "" : e.getMessage());
        } finally {
            long finishedAt = System.currentTimeMillis();
            if (terminalErr != null) jobRepo.finish(ctx.jobId(), terminal, finishedAt, terminalErr);
            else jobRepo.finish(ctx.jobId(), terminal, finishedAt);
            running.remove(ctx.type());
            ProcessingJob finalJob = jobRepo.findById(ctx.jobId()).orElseThrow();
            sse.publish(ctx.jobId(), "done", finalJob);
            sse.complete(ctx.jobId());
            log.info("processing-job: finished type={} jobId={} status={} processed={}/{}",
                    ctx.type(), ctx.jobId(), terminal, finalJob.processed(), finalJob.total());
        }
    }

    /** Worker 用的最小上下文 —— jobId / type / cancel 标志。 */
    public record JobContext(String jobId, ProcessingJobType type, AtomicBoolean cancelled) {}

    /** 内存中跟踪 RUNNING 任务的 handle。线程对象保留是为了将来想 interrupt 兜底（本期不用）。 */
    private record JobHandle(String jobId, AtomicBoolean cancelled, Thread thread) {}

    /** init 事件 payload —— 只在 setTotal 时发一次。 */
    public record InitEvent(String jobId, long total) {}
}
