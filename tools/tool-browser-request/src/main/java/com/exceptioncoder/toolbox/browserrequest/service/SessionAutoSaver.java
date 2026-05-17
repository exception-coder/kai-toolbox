package com.exceptioncoder.toolbox.browserrequest.service;

import com.exceptioncoder.toolbox.browserrequest.config.BrowserRequestProperties;
import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * 定期把所有活跃 BrowserContext 的 storage state（cookies / localStorage）落盘，
 * 用户不用手动点「保存登录态」也能在下次启动时直接复用登录态。
 *
 * 触发时机：
 *   1. 启动后每 {@link BrowserRequestProperties#getAutoSaveIntervalMs()} 毫秒一次
 *   2. 应用关闭 (@PreDestroy) 时强制保存所有活跃 ctx
 *
 * 调用 {@link BrowserRequestService#saveStorage(String)} 会同时更新 DB 的 has_storage 字段，
 * 因此前端列表里的「已登录」徽标会自动点亮。
 */
@Slf4j
@Component
public class SessionAutoSaver {

    private final BrowserRequestProperties props;
    private final BrowserSessionManager manager;
    private final BrowserRequestService service;

    private ScheduledExecutorService scheduler;

    public SessionAutoSaver(BrowserRequestProperties props,
                            BrowserSessionManager manager,
                            BrowserRequestService service) {
        this.props = props;
        this.manager = manager;
        this.service = service;
    }

    @PostConstruct
    public void start() {
        if (!props.isAutoSaveEnabled()) {
            log.info("[BrowserRequest] storage state 自动保存已关闭");
            return;
        }
        long interval = Math.max(5_000, props.getAutoSaveIntervalMs());
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "browser-request-autosave");
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleWithFixedDelay(this::saveAllQuietly,
                interval, interval, TimeUnit.MILLISECONDS);
        log.info("[BrowserRequest] storage state 自动保存已启用，间隔 {} ms", interval);
    }

    private void saveAllQuietly() {
        Set<String> ids = manager.getOpenSessionIds();
        if (ids.isEmpty()) return;
        int ok = 0, skipped = 0, failed = 0;
        for (String id : ids) {
            if (!manager.isActive(id)) { skipped++; continue; }
            try {
                service.saveStorage(id);
                ok++;
            } catch (Exception e) {
                failed++;
                log.debug("[BrowserRequest] 自动保存 {} 失败: {}", id, e.getMessage());
            }
        }
        if (ok > 0 || failed > 0) {
            log.info("[BrowserRequest] 自动保存 storage state: ok={}, skipped={}, failed={}",
                    ok, skipped, failed);
        }
    }

    @PreDestroy
    public void shutdown() {
        if (scheduler == null) return;
        try {
            // 应用退出前最后一次强制保存——避免用户登录后立刻关 IDE 丢登录态
            saveAllQuietly();
        } catch (Exception ignored) {}
        scheduler.shutdown();
        try {
            if (!scheduler.awaitTermination(3, TimeUnit.SECONDS)) {
                scheduler.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            scheduler.shutdownNow();
        }
    }
}
