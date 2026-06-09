package com.exceptioncoder.toolbox.browserrequest.service;

import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import com.exceptioncoder.toolbox.browserrequest.config.UndetectedBrowserSidecar;
import com.exceptioncoder.toolbox.browserrequest.domain.BrowserSession;
import com.exceptioncoder.toolbox.browserrequest.domain.Recording;
import com.exceptioncoder.toolbox.browserrequest.domain.Task;
import com.exceptioncoder.toolbox.browserrequest.repository.BrowserSessionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.util.List;
import java.util.UUID;

/**
 * 会话管理：列表 / 创建 / 打开 / 关闭 / 保存登录态 / 删除。
 * 删除会话时级联清理 recording（连带 http_call）+ task（连带 task_run）。
 */
@Slf4j
@Service
public class BrowserRequestService {

    private final BrowserSessionRepository repo;
    private final BrowserSessionManager manager;
    private final RecordingService recordingService;
    private final BrowserRequestTaskService BrowserRequestTaskService;
    private final UndetectedBrowserSidecar sidecar;

    public BrowserRequestService(BrowserSessionRepository repo,
                                 BrowserSessionManager manager,
                                 RecordingService recordingService,
                                 BrowserRequestTaskService BrowserRequestTaskService,
                                 UndetectedBrowserSidecar sidecar) {
        this.repo = repo;
        this.manager = manager;
        this.recordingService = recordingService;
        this.BrowserRequestTaskService = BrowserRequestTaskService;
        this.sidecar = sidecar;
    }

    /** undetected-node 引擎：会话生命周期走 patchright sidecar，而非自带 Java Playwright。 */
    private boolean nodeEngine() { return sidecar.enabled(); }

    /** 按当前引擎判断会话是否在线。 */
    private boolean active(String id) {
        return nodeEngine() ? sidecar.isOpen(id) : manager.isActive(id);
    }

    public List<SessionView> list() {
        return repo.findAll().stream()
                .map(s -> SessionView.from(s, active(s.getId()), manager))
                .toList();
    }

    public SessionView create(String name, String url) {
        long now = System.currentTimeMillis();
        BrowserSession s = BrowserSession.builder()
                .id(UUID.randomUUID().toString())
                .name(name == null || name.isBlank() ? "未命名会话" : name.trim())
                .url(url)
                .hasStorage(false)
                .lastActiveAt(null)
                .createdAt(now)
                .updatedAt(now)
                .build();
        repo.insert(s);
        return SessionView.from(s, false, manager);
    }

    public SessionView open(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        if (nodeEngine()) sidecar.openSession(s.getId(), s.getUrl());
        else manager.openSession(s.getId(), s.getUrl());
        long now = System.currentTimeMillis();
        repo.touchActive(id, now);
        s.setLastActiveAt(now);
        s.setUpdatedAt(now);
        return SessionView.from(s, true, manager);
    }

    /** 列出该会话浏览器当前所有页签 URL（移动端看不到桌面窗口时确认最终停在哪）。 */
    public List<String> listPageUrls(String id) {
        return nodeEngine() ? sidecar.listPageUrls(id) : manager.listPageUrls(id);
    }

    public SessionView saveStorage(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        if (nodeEngine()) sidecar.save(id, manager.storageStatePath(id));
        else manager.saveStorageState(id);
        long now = System.currentTimeMillis();
        repo.markStorageSaved(id, true, now);
        s.setHasStorage(true);
        s.setUpdatedAt(now);
        return SessionView.from(s, active(id), manager);
    }

    public SessionView clearStorage(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        if (nodeEngine()) sidecar.clear(id);
        else manager.clearStorageState(id);
        long now = System.currentTimeMillis();
        repo.markStorageSaved(id, false, now);
        s.setHasStorage(false);
        s.setUpdatedAt(now);
        return SessionView.from(s, active(id), manager);
    }

    public SessionView close(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        // 关 ctx 前若有 active recording，先停止
        recordingService.onSessionClosed(id);
        if (nodeEngine()) {
            // node 引擎：登录态随持久 profile 保留，无需 closeSession 的存盘返回值
            sidecar.close(id);
            return SessionView.from(s, false, manager);
        }
        boolean savedBeforeClose = manager.closeSession(id);
        if (savedBeforeClose) {
            long now = System.currentTimeMillis();
            repo.markStorageSaved(id, true, now);
            s.setHasStorage(true);
            s.setUpdatedAt(now);
        }
        return SessionView.from(s, false, manager);
    }

    public void delete(String id) {
        recordingService.onSessionClosed(id);
        if (nodeEngine()) {
            sidecar.close(id);
            sidecar.clear(id);
        } else {
            manager.closeSession(id);
            manager.clearStorageState(id);
        }
        // 同步删除会话目录（即使空目录残留也清干净）
        try {
            var dir = manager.storageStatePath(id).getParent();
            if (dir != null && Files.exists(dir)) {
                try (var s = Files.list(dir)) {
                    s.forEach(p -> { try { Files.deleteIfExists(p); } catch (Exception ignored) {} });
                }
                Files.deleteIfExists(dir);
            }
        } catch (Exception e) {
            log.warn("清理 session 目录失败 {}: {}", id, e.getMessage());
        }
        // 级联清理：先 task（含 task_run），再 recording（含 http_call）
        for (Task t : BrowserRequestTaskService.listBySession(id)) {
            BrowserRequestTaskService.delete(t.id());
        }
        for (Recording r : recordingService.listBySession(id)) {
            recordingService.delete(r.id());
        }
        repo.deleteById(id);
    }

    public record SessionView(String id, String name, String url, boolean active,
                              boolean hasStorage, Long lastActiveAt, long createdAt, long updatedAt,
                              Long storageBytes, Long storageSavedAt) {
        public static SessionView from(BrowserSession s, boolean active, BrowserSessionManager manager) {
            return new SessionView(s.getId(), s.getName(), s.getUrl(), active,
                    s.isHasStorage(), s.getLastActiveAt(), s.getCreatedAt(), s.getUpdatedAt(),
                    manager.storageStateSize(s.getId()),
                    manager.storageStateModified(s.getId()));
        }
    }
}
