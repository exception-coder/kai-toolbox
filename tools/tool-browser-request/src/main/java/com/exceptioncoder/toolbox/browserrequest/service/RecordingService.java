package com.exceptioncoder.toolbox.browserrequest.service;

import com.exceptioncoder.toolbox.browserrequest.api.dto.StartRecordingRequest;
import com.exceptioncoder.toolbox.browserrequest.config.BrowserRequestProperties;
import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import com.exceptioncoder.toolbox.browserrequest.domain.HttpCall;
import com.exceptioncoder.toolbox.browserrequest.domain.Recording;
import com.exceptioncoder.toolbox.browserrequest.domain.enums.RecordingStatus;
import com.exceptioncoder.toolbox.browserrequest.repository.HttpCallRepository;
import com.exceptioncoder.toolbox.browserrequest.repository.RecordingRepository;
import com.exceptioncoder.toolbox.browserrequest.repository.BrowserRequestTaskRepository;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Recording 元数据管理 + 启停编排 + 硬上限超时检测。
 *
 * - 单 session 单 active：start 时若已存在 active 先 stop（不抛错）
 * - 硬上限：60min / 5000 call；触达自动 STOP + 推 SSE
 * - 应用启动：旧 RECORDING 行统一标记 ABANDONED
 */
@Slf4j
@Service
public class RecordingService {

    /** STOP 原因，供 SSE recording-stopped 事件携带。 */
    public enum StopReason { USER_STOP, MAX_DURATION, MAX_CALLS, SESSION_CLOSED }

    private final RecordingRepository recordingRepo;
    private final HttpCallRepository callRepo;
    private final BrowserRequestTaskRepository taskRepo;
    private final HttpRecorder recorder;
    private final BrowserSessionManager sessionMgr;
    private final BrowserRequestProperties props;
    private final SseEmitterRegistry sseRegistry;

    /** 后台扫描超时录制的定时器。每 30s tick 一次。 */
    private ScheduledExecutorService scheduler;

    public RecordingService(RecordingRepository recordingRepo,
                            HttpCallRepository callRepo,
                            BrowserRequestTaskRepository taskRepo,
                            HttpRecorder recorder,
                            BrowserSessionManager sessionMgr,
                            BrowserRequestProperties props,
                            SseEmitterRegistry sseRegistry) {
        this.recordingRepo = recordingRepo;
        this.callRepo = callRepo;
        this.taskRepo = taskRepo;
        this.recorder = recorder;
        this.sessionMgr = sessionMgr;
        this.props = props;
        this.sseRegistry = sseRegistry;
    }

    @PostConstruct
    public void init() {
        int n = recordingRepo.abandonAllOnStartup(System.currentTimeMillis());
        if (n > 0) {
            log.info("[RecordingService] 启动时清理 {} 条上次未正常停止的录制 → ABANDONED", n);
        }
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "recording-timeout-scanner");
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleAtFixedRate(this::scanTimeouts, 30, 30, TimeUnit.SECONDS);
    }

    @PreDestroy
    public void shutdown() {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
        recorder.shutdown();
    }

    public Recording start(String sessionId, StartRecordingRequest req) {
        if (!sessionMgr.isActive(sessionId)) {
            throw new IllegalStateException("会话未打开: " + sessionId);
        }
        // 若已有 active：先 STOP 旧的
        recordingRepo.findActiveBySession(sessionId).ifPresent(old ->
                stop(old.id(), StopReason.USER_STOP));

        String name = req != null && req.name() != null && !req.name().isBlank()
                ? req.name()
                : "录制 " + new SimpleDateFormat("yyyy-MM-dd HH:mm").format(new Date());
        // 4 类 capture 开关 DTO 为 null 时套默认：xhr/fetch 默认开（业务接口），document/script 默认关（HTML/JS 太大且业务回放用不到）
        boolean captureXhr      = req == null || req.captureXhr()      == null ? true  : req.captureXhr();
        boolean captureFetch    = req == null || req.captureFetch()    == null ? true  : req.captureFetch();
        boolean captureDocument = req == null || req.captureDocument() == null ? false : req.captureDocument();
        boolean captureScript   = req == null || req.captureScript()   == null ? false : req.captureScript();
        // 响应体截断位：前端选；null 时默认 2 MB；统一夹到后端硬上限（maxBytes）之内，防止滥用
        int defaultTruncate = Math.min(2 * 1024 * 1024, props.getResponseBodyMaxBytes());
        int truncateAt = req != null && req.responseBodyTruncateAtBytes() != null
                ? Math.max(1024, Math.min(req.responseBodyTruncateAtBytes(), props.getResponseBodyMaxBytes()))
                : defaultTruncate;
        HttpRecorder.CaptureFilter filter = new HttpRecorder.CaptureFilter(
                captureXhr, captureFetch, captureDocument, captureScript, truncateAt);
        Recording r = new Recording(
                UUID.randomUUID().toString(),
                sessionId,
                name,
                RecordingStatus.RECORDING,
                captureScript,
                System.currentTimeMillis(),
                null,
                0
        );
        recordingRepo.insert(r);
        // 在 worker 线程上挂监听
        sessionMgr.runWithCtx(sessionId, ctx -> {
            recorder.attach(sessionId, r.id(), filter, ctx);
            return null;
        });
        log.info("[RecordingService] started recordingId={} sessionId={} name={} filter={}",
                r.id(), sessionId, name, filter);
        return r;
    }

    public Recording stop(String recordingId, StopReason reason) {
        Optional<Recording> opt = recordingRepo.findById(recordingId);
        if (opt.isEmpty()) throw new IllegalArgumentException("录制不存在: " + recordingId);
        Recording r = opt.get();
        if (r.status() != RecordingStatus.RECORDING) {
            // 幂等：已经停了直接返回当前
            return r;
        }
        int total = recorder.detach(r.sessionId());
        long now = System.currentTimeMillis();
        RecordingStatus next = reason == StopReason.MAX_DURATION || reason == StopReason.MAX_CALLS
                ? RecordingStatus.AUTO_STOPPED
                : RecordingStatus.STOPPED;
        recordingRepo.updateStatus(recordingId, next, now);

        Map<String, Object> payload = new HashMap<>();
        payload.put("status", next.name());
        payload.put("reason", reason.name());
        payload.put("callCount", total);
        payload.put("endedAt", now);
        sseRegistry.publish("recording:" + recordingId, "recording-stopped", payload);
        // emitter 推完整体完成
        sseRegistry.complete("recording:" + recordingId);

        log.info("[RecordingService] stopped recordingId={} reason={} totalCalls={}",
                recordingId, reason, total);
        return recordingRepo.findById(recordingId).orElse(r);
    }

    public List<Recording> listBySession(String sessionId) {
        return recordingRepo.findBySessionOrderByStartedDesc(sessionId);
    }

    public RecordingDetail detail(String recordingId, boolean withCalls, int offset, int limit) {
        Recording r = recordingRepo.findById(recordingId)
                .orElseThrow(() -> new IllegalArgumentException("录制不存在: " + recordingId));
        if (!withCalls) {
            return new RecordingDetail(r, List.of(), 0, false);
        }
        // limit 上限提到 recordingMaxCalls（默认 5000），让 SSE 订阅时 backfill 能拿全
        int safe = Math.min(Math.max(1, limit), props.getRecordingMaxCalls());
        int total = callRepo.countByRecording(recordingId);
        List<HttpCall> calls = callRepo.findByRecording(recordingId, Math.max(0, offset), safe);
        boolean hasMore = (offset + calls.size()) < total;
        return new RecordingDetail(r, calls, total, hasMore);
    }

    /** 删除录制：先停（如果在录）+ 删 call + 把指向本 recording 的 task.recording_id 置 NULL + 删 recording */
    public void delete(String recordingId) {
        Recording r = recordingRepo.findById(recordingId).orElse(null);
        if (r == null) return;
        if (r.status() == RecordingStatus.RECORDING) {
            stop(recordingId, RecordingService.StopReason.USER_STOP);
        }
        callRepo.deleteByRecording(recordingId);
        taskRepo.detachRecording(recordingId);
        recordingRepo.deleteById(recordingId);
    }

    /** 由 BrowserSessionManager.closeSession 触发（这里通过定时扫描间接覆盖；未来可加显式钩子）。 */
    public void onSessionClosed(String sessionId) {
        recordingRepo.findActiveBySession(sessionId).ifPresent(r ->
                stop(r.id(), StopReason.SESSION_CLOSED));
    }

    /** 30s 一跳：检查是否达到时长/调用数硬上限。 */
    void scanTimeouts() {
        try {
            long now = System.currentTimeMillis();
            for (String sessionId : sessionMgr.getOpenSessionIds()) {
                recordingRepo.findActiveBySession(sessionId).ifPresent(r -> {
                    if (now - r.startedAt() >= props.getRecordingMaxDurationMs()) {
                        stop(r.id(), StopReason.MAX_DURATION);
                        return;
                    }
                    int cnt = recorder.callCount(sessionId);
                    if (cnt >= props.getRecordingMaxCalls()) {
                        stop(r.id(), StopReason.MAX_CALLS);
                    }
                });
            }
            // session 被关掉但 recording 还是 RECORDING：兜底
            // （现阶段 BrowserSessionManager.closeSession 没有 listener 入口，先靠这一遍兜住）
            // 后续可改为事件驱动
        } catch (Exception e) {
            log.warn("[RecordingService] scanTimeouts 异常: {}", e.getMessage());
        }
    }

    public record RecordingDetail(Recording recording, List<HttpCall> calls, int callsTotal, boolean callsHasMore) {}
}
