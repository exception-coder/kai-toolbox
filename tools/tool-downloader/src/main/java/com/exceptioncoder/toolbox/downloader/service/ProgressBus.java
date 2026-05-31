package com.exceptioncoder.toolbox.downloader.service;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.downloader.config.DownloaderProperties;
import com.exceptioncoder.toolbox.downloader.domain.DownloadSegment;
import com.exceptioncoder.toolbox.downloader.domain.RouteDecision;
import com.exceptioncoder.toolbox.downloader.domain.RouteType;
import com.exceptioncoder.toolbox.downloader.domain.TaskState;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 任务进度窗口聚合 + 调用 toolbox-common SseEmitterRegistry 推送。
 * - addBytes: lock-free 累加到本任务窗口
 * - @Scheduled 500ms 触发 flush，把窗口字节数转换为速率 + ETA → 推送 progress 事件
 * - state / segment 事件不走窗口，直接推送（保证送达）
 */
@Service
public class ProgressBus {

    private final SseEmitterRegistry sse;
    private final DownloaderProperties props;

    private final Map<Long, TaskWindow> windows = new ConcurrentHashMap<>();

    public ProgressBus(SseEmitterRegistry sse, DownloaderProperties props) {
        this.sse = sse;
        this.props = props;
    }

    /** 任务进入活跃状态时初始化窗口；非线程安全的初始化由 DownloaderTaskService 单一入口保证 */
    public void registerActive(long taskId, long downloadedBytes, long totalBytes) {
        TaskWindow w = windows.computeIfAbsent(taskId, k -> new TaskWindow());
        w.downloaded.set(downloadedBytes);
        w.total = totalBytes;
    }

    public void addBytes(long taskId, long delta) {
        TaskWindow w = windows.get(taskId);
        if (w == null) return;
        w.downloaded.addAndGet(delta);
        w.windowDelta.addAndGet(delta);
    }

    public void publishState(long taskId, TaskState state, RouteType routeType, String routeProxy, String error) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("taskId", taskId);
        payload.put("state", state.name());
        payload.put("routeType", routeType == null ? null : routeType.name());
        payload.put("routeProxy", routeProxy);
        payload.put("error", error);
        sse.publish(String.valueOf(taskId), "state", payload);
    }

    public void publishRouteDecided(long taskId, RouteDecision d) {
        publishState(taskId, TaskState.DOWNLOADING, d.route(), d.proxyOrigin(), null);
    }

    public void publishSegment(long taskId, DownloadSegment seg) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("taskId", taskId);
        payload.put("seqNo", seg.getSeqNo());
        payload.put("state", seg.getState().name());
        payload.put("attempts", seg.getAttempts());
        payload.put("bytesDownloaded", seg.getBytesDownloaded());
        sse.publish(String.valueOf(taskId), "segment", payload);
    }

    public void closeTask(long taskId) {
        windows.remove(taskId);
        sse.complete(String.valueOf(taskId));
    }

    /** 仅释放聚合状态，不关 SSE（PAUSED 场景沿用同一个 emitter） */
    public void deactivate(long taskId) {
        windows.remove(taskId);
    }

    public long currentDownloaded(long taskId) {
        TaskWindow w = windows.get(taskId);
        return w == null ? 0 : w.downloaded.get();
    }

    @Scheduled(fixedDelayString = "${toolbox.downloader.sse-flush-interval-ms:500}",
               initialDelayString = "${toolbox.downloader.sse-flush-interval-ms:500}")
    public void flush() {
        if (windows.isEmpty()) return;
        long intervalMs = props.getSseFlushIntervalMs();
        for (var e : windows.entrySet()) {
            long taskId = e.getKey();
            TaskWindow w = e.getValue();
            long delta = w.windowDelta.getAndSet(0);
            long rateBps = (long) (delta * 1000.0 / Math.max(1, intervalMs));
            long downloaded = w.downloaded.get();
            Long eta = null;
            if (w.total > 0 && rateBps > 0) {
                long remaining = Math.max(0, w.total - downloaded);
                eta = remaining / rateBps;
            }
            Map<String, Object> payload = new HashMap<>();
            payload.put("taskId", taskId);
            payload.put("downloaded", downloaded);
            payload.put("total", w.total);
            payload.put("rateBps", rateBps);
            payload.put("etaSeconds", eta);
            sse.publish(String.valueOf(taskId), "progress", payload);
        }
    }

    private static class TaskWindow {
        final AtomicLong downloaded = new AtomicLong();   // 累计已下载
        final AtomicLong windowDelta = new AtomicLong();   // 本窗口内的增量
        volatile long total = -1;
    }
}
