package com.exceptioncoder.toolbox.magnet.service;

import com.exceptioncoder.toolbox.magnet.config.MagnetProperties;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 周期性打印 aria2 当前活跃任务的摘要 + 任务状态翻转（开始 / 完成 / 失败）日志。
 *
 * <p>解决「daemon 在跑、但控制台日志看不出当前在做什么、谁解析完了、谁下完了」的运维感知问题。
 * 仅打印日志，不暴露 HTTP 接口（前端已有 /api/magnet/tasks 列表）。
 */
@Component
public class Aria2ProgressLogger {

    private static final Logger log = LoggerFactory.getLogger(Aria2ProgressLogger.class);

    private final Aria2DaemonManager daemon;
    private final Aria2RpcClient rpc;
    private final MagnetProperties props;

    private volatile Thread worker;
    private volatile boolean running;

    /** 上一轮活跃任务 gid → 显示名；用于 diff 出新进入/退出活跃集合的任务。 */
    private final Map<String, String> lastActive = new ConcurrentHashMap<>();

    public Aria2ProgressLogger(Aria2DaemonManager daemon, Aria2RpcClient rpc, MagnetProperties props) {
        this.daemon = daemon;
        this.rpc = rpc;
        this.props = props;
    }

    @PostConstruct
    public void start() {
        int interval = props.getProgressLogIntervalSeconds();
        if (interval <= 0) {
            log.info("aria2 progress logger 已关闭 (toolbox.magnet.progress-log-interval-seconds<=0)");
            return;
        }
        running = true;
        // 用虚拟线程：项目已开 spring.threads.virtual.enabled，且这里是慢 IO + sleep，正合适
        worker = Thread.ofVirtual().name("aria2-progress-logger").start(this::loop);
        log.info("aria2 progress logger 已启动，每 {}s 打印一次活跃任务摘要", interval);
    }

    @PreDestroy
    public void stop() {
        running = false;
        Thread t = this.worker;
        if (t != null) t.interrupt();
    }

    // aria2 没有"任务变化"事件推送，只能轮询；间隔 ≥1s 远谈不上忙等
    @SuppressWarnings("BusyWait")
    private void loop() {
        long intervalMs = Math.max(1, props.getProgressLogIntervalSeconds()) * 1000L;
        while (running) {
            try {
                if (daemon.isReady()) tick();
            } catch (Exception e) {
                log.debug("aria2 progress tick 异常：{}", e.toString());
            }
            try { Thread.sleep(intervalMs); }
            catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
        }
    }

    private void tick() throws IOException {
        List<Map<String, Object>> active = rpc.tellActive();

        Map<String, String> currentActive = new HashMap<>();
        StringBuilder summary = null;
        for (Map<String, Object> raw : active) {
            String gid = str(raw.get("gid"));
            if (gid == null) continue;
            String name = pickName(raw);
            currentActive.put(gid, name);
            if (summary == null) summary = new StringBuilder("[aria2] active=").append(active.size());
            summary.append("\n  ▸ ").append(formatTask(gid, name, raw));
        }
        // 没活跃任务时不刷屏；状态翻转日志仍会在下面打出来
        if (summary != null) log.info("{}", summary);

        // 本轮新进入活跃集 → 开始解析/下载
        for (Map.Entry<String, String> e : currentActive.entrySet()) {
            if (!lastActive.containsKey(e.getKey())) {
                log.info("[aria2] task started: gid={} name={}", e.getKey(), e.getValue());
            }
        }
        // 上一轮在、本轮没了 → 查终态判定 complete / error / removed
        for (Map.Entry<String, String> e : lastActive.entrySet()) {
            if (!currentActive.containsKey(e.getKey())) {
                reportFinal(e.getKey(), e.getValue());
            }
        }
        lastActive.clear();
        lastActive.putAll(currentActive);
    }

    private void reportFinal(String gid, String name) {
        try {
            Map<String, Object> raw = rpc.tellStatus(gid);
            String status = str(raw.get("status"));
            if ("complete".equalsIgnoreCase(status)) {
                long total = parseLong(raw.get("totalLength"));
                log.info("[aria2] task completed: gid={} name={} size={}", gid, name, humanBytes(total));
            } else if ("error".equalsIgnoreCase(status)) {
                log.warn("[aria2] task failed: gid={} name={} errorCode={} msg={}",
                        gid, name, str(raw.get("errorCode")), str(raw.get("errorMessage")));
            } else if ("removed".equalsIgnoreCase(status)) {
                log.info("[aria2] task removed: gid={} name={}", gid, name);
            } else {
                // paused / waiting：信息量不大，降级到 debug
                log.debug("[aria2] task left active: gid={} name={} status={}", gid, name, status);
            }
        } catch (IOException ex) {
            log.debug("aria2 tellStatus on finished gid={} 失败: {}", gid, ex.toString());
        }
    }

    private static String formatTask(String gid, String name, Map<String, Object> raw) {
        long total = parseLong(raw.get("totalLength"));
        long done = parseLong(raw.get("completedLength"));
        long dl = parseLong(raw.get("downloadSpeed"));
        long ul = parseLong(raw.get("uploadSpeed"));
        int peers = (int) parseLong(raw.get("connections"));
        // total==0 一般是磁力链 metadata 阶段，这时 done/total 都还没意义
        if (total == 0) {
            return String.format(Locale.ROOT, "%s %s  [metadata 解析中]  peers=%d ↓%s ↑%s",
                    gid, name, peers, humanRate(dl), humanRate(ul));
        }
        double pct = done * 100.0 / total;
        return String.format(Locale.ROOT, "%s %s  %.1f%% (%s / %s)  ↓%s ↑%s  peers=%d",
                gid, name, pct, humanBytes(done), humanBytes(total),
                humanRate(dl), humanRate(ul), peers);
    }

    private static String pickName(Map<String, Object> raw) {
        Object bt = raw.get("bittorrent");
        if (bt instanceof Map<?, ?> btMap) {
            Object info = btMap.get("info");
            if (info instanceof Map<?, ?> infoMap) {
                Object n = infoMap.get("name");
                if (n != null) return n.toString();
            }
        }
        Object files = raw.get("files");
        if (files instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> f0) {
            Object p = f0.get("path");
            if (p != null) {
                String s = p.toString();
                int sep = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
                return sep >= 0 ? s.substring(sep + 1) : s;
            }
        }
        return "<unnamed>";
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }

    private static long parseLong(Object o) {
        if (o == null) return 0;
        try { return Long.parseLong(o.toString()); } catch (NumberFormatException e) { return 0; }
    }

    private static String humanBytes(long n) {
        if (n < 1024) return n + "B";
        double v = n;
        String[] u = {"KB", "MB", "GB", "TB"};
        int i = -1;
        while (v >= 1024 && i < u.length - 1) {
            v /= 1024;
            i++;
        }
        return String.format(Locale.ROOT, "%.1f%s", v, u[i]);
    }

    private static String humanRate(long bps) {
        return humanBytes(bps) + "/s";
    }
}
