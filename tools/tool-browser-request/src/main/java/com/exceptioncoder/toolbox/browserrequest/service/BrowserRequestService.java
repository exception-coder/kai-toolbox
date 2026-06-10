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
    private final AiFlowService aiFlowService;

    public BrowserRequestService(BrowserSessionRepository repo,
                                 BrowserSessionManager manager,
                                 RecordingService recordingService,
                                 BrowserRequestTaskService BrowserRequestTaskService,
                                 UndetectedBrowserSidecar sidecar,
                                 AiFlowService aiFlowService) {
        this.repo = repo;
        this.manager = manager;
        this.recordingService = recordingService;
        this.BrowserRequestTaskService = BrowserRequestTaskService;
        this.sidecar = sidecar;
        this.aiFlowService = aiFlowService;
    }

    /** 该会话是否走 undetected-node 引擎（patchright sidecar）。会话未指定 engine 时回退全局默认。 */
    private boolean isNode(BrowserSession s) {
        String e = (s == null) ? null : s.getEngine();
        if (e == null || e.isBlank()) return sidecar.enabledByDefault();
        return "undetected-node".equalsIgnoreCase(e);
    }

    /** 按该会话所属引擎判断是否在线。 */
    private boolean active(BrowserSession s) {
        return isNode(s) ? sidecar.isOpen(s.getId()) : manager.isActive(s.getId());
    }

    public List<SessionView> list() {
        return repo.findAll().stream()
                .map(s -> SessionView.from(s, active(s), manager))
                .toList();
    }

    public SessionView create(String name, String url, String engine) {
        long now = System.currentTimeMillis();
        String eng = (engine == null || engine.isBlank()) ? null : engine.trim();
        BrowserSession s = BrowserSession.builder()
                .id(UUID.randomUUID().toString())
                .name(name == null || name.isBlank() ? "未命名会话" : name.trim())
                .url(url)
                .hasStorage(false)
                .lastActiveAt(null)
                .createdAt(now)
                .updatedAt(now)
                .engine(eng)
                .build();
        repo.insert(s);
        return SessionView.from(s, false, manager);
    }

    public SessionView open(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        if (isNode(s)) sidecar.openSession(s.getId(), s.getUrl());
        else manager.openSession(s.getId(), s.getUrl());
        long now = System.currentTimeMillis();
        repo.touchActive(id, now);
        s.setLastActiveAt(now);
        s.setUpdatedAt(now);
        return SessionView.from(s, true, manager);
    }

    /** 列出该会话浏览器当前所有页签 URL（移动端看不到桌面窗口时确认最终停在哪）。 */
    public List<String> listPageUrls(String id) {
        BrowserSession s = repo.findById(id).orElse(null);
        return (s != null && isNode(s)) ? sidecar.listPageUrls(id) : manager.listPageUrls(id);
    }

    /** 当前页面截图（JPEG 字节），供移动端「实时画面」。 */
    public byte[] screenshot(String id) {
        BrowserSession s = repo.findById(id).orElse(null);
        return (s != null && isNode(s)) ? sidecar.screenshot(id) : manager.screenshot(id);
    }

    /** 归一化坐标远程点击（fx,fy ∈ [0,1]）。 */
    public void click(String id, double fx, double fy) {
        BrowserSession s = repo.findById(id).orElse(null);
        if (s != null && isNode(s)) sidecar.click(id, fx, fy);
        else manager.click(id, fx, fy);
    }

    public SessionView saveStorage(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        if (isNode(s)) sidecar.save(id, manager.storageStatePath(id));
        else manager.saveStorageState(id);
        long now = System.currentTimeMillis();
        repo.markStorageSaved(id, true, now);
        s.setHasStorage(true);
        s.setUpdatedAt(now);
        return SessionView.from(s, active(s), manager);
    }

    public SessionView clearStorage(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        if (isNode(s)) sidecar.clear(id);
        else manager.clearStorageState(id);
        long now = System.currentTimeMillis();
        repo.markStorageSaved(id, false, now);
        s.setHasStorage(false);
        s.setUpdatedAt(now);
        return SessionView.from(s, active(s), manager);
    }

    public SessionView close(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        // 关 ctx 前若有 active recording，先停止
        recordingService.onSessionClosed(id);
        if (isNode(s)) {
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
        BrowserSession sess = repo.findById(id).orElse(null);
        if (sess != null && isNode(sess)) {
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
        // 级联清理：AI 用例 → task（含 task_run）→ recording（含 http_call）
        aiFlowService.onSessionDeleted(id);
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
                              Long storageBytes, Long storageSavedAt, String engine) {
        public static SessionView from(BrowserSession s, boolean active, BrowserSessionManager manager) {
            return new SessionView(s.getId(), s.getName(), s.getUrl(), active,
                    s.isHasStorage(), s.getLastActiveAt(), s.getCreatedAt(), s.getUpdatedAt(),
                    manager.storageStateSize(s.getId()),
                    manager.storageStateModified(s.getId()),
                    s.getEngine());
        }
    }
}
