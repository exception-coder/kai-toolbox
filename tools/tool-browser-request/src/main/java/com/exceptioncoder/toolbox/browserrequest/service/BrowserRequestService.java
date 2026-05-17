package com.exceptioncoder.toolbox.browserrequest.service;

import com.exceptioncoder.toolbox.browserrequest.config.BrowserSessionManager;
import com.exceptioncoder.toolbox.browserrequest.domain.BrowserSession;
import com.exceptioncoder.toolbox.browserrequest.domain.SavedRequest;
import com.exceptioncoder.toolbox.browserrequest.repository.BrowserSessionRepository;
import com.exceptioncoder.toolbox.browserrequest.repository.SavedRequestRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
public class BrowserRequestService {

    private static final TypeReference<Map<String, String>> HEADERS_TYPE = new TypeReference<>() {};

    private final BrowserSessionRepository repo;
    private final SavedRequestRepository savedRepo;
    private final BrowserSessionManager manager;
    private final ObjectMapper objectMapper;

    public BrowserRequestService(BrowserSessionRepository repo,
                                 SavedRequestRepository savedRepo,
                                 BrowserSessionManager manager,
                                 ObjectMapper objectMapper) {
        this.repo = repo;
        this.savedRepo = savedRepo;
        this.manager = manager;
        this.objectMapper = objectMapper;
    }

    public List<SessionView> list() {
        return repo.findAll().stream()
                .map(s -> SessionView.from(s, manager.isActive(s.getId()), manager))
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
        manager.openSession(s.getId(), s.getUrl());
        long now = System.currentTimeMillis();
        repo.touchActive(id, now);
        s.setLastActiveAt(now);
        s.setUpdatedAt(now);
        return SessionView.from(s, true, manager);
    }

    public SessionView saveStorage(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        manager.saveStorageState(id);
        long now = System.currentTimeMillis();
        repo.markStorageSaved(id, true, now);
        s.setHasStorage(true);
        s.setUpdatedAt(now);
        return SessionView.from(s, manager.isActive(id), manager);
    }

    public SessionView clearStorage(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        manager.clearStorageState(id);
        long now = System.currentTimeMillis();
        repo.markStorageSaved(id, false, now);
        s.setHasStorage(false);
        s.setUpdatedAt(now);
        return SessionView.from(s, manager.isActive(id), manager);
    }

    public SessionView close(String id) {
        BrowserSession s = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
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
        manager.closeSession(id);
        manager.clearStorageState(id);
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
        savedRepo.deleteBySession(id);
        repo.deleteById(id);
    }

    // ── JS 捕获 ───────────────────────────────────────────────────────────────

    public CaptureStatusView startCapture(String sessionId) {
        repo.findById(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        manager.startJsCapture(sessionId);
        return captureStatus(sessionId);
    }

    public CaptureStatusView stopCapture(String sessionId) {
        manager.stopJsCapture(sessionId);
        return captureStatus(sessionId);
    }

    public CaptureStatusView captureStatus(String sessionId) {
        return new CaptureStatusView(
                manager.isJsCaptureActive(sessionId),
                manager.jsCaptureCount(sessionId),
                manager.captureDir(sessionId).toAbsolutePath().toString());
    }

    public record CaptureStatusView(boolean active, int capturedCount, String directory) {}

    // ── 收藏的请求 ───────────────────────────────────────────────────────────

    public List<SavedRequestView> listSaved(String sessionId) {
        repo.findById(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        return savedRepo.findBySession(sessionId).stream().map(this::toView).toList();
    }

    public SavedRequestView createSaved(String sessionId, SaveCommand cmd) {
        repo.findById(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        long now = System.currentTimeMillis();
        SavedRequest r = SavedRequest.builder()
                .id(UUID.randomUUID().toString())
                .sessionId(sessionId)
                .name(resolveName(cmd))
                .curl(emptyToNull(cmd.curl()))
                .method(emptyToNull(cmd.method()))
                .url(emptyToNull(cmd.url()))
                .headersJson(serializeHeaders(cmd.headers()))
                .body(emptyToNull(cmd.body()))
                .createdAt(now)
                .updatedAt(now)
                .build();
        savedRepo.insert(r);
        return toView(r);
    }

    public SavedRequestView updateSaved(String savedId, SaveCommand cmd) {
        SavedRequest r = savedRepo.findById(savedId)
                .orElseThrow(() -> new IllegalArgumentException("保存的请求不存在: " + savedId));
        r.setName(resolveName(cmd));
        r.setCurl(emptyToNull(cmd.curl()));
        r.setMethod(emptyToNull(cmd.method()));
        r.setUrl(emptyToNull(cmd.url()));
        r.setHeadersJson(serializeHeaders(cmd.headers()));
        r.setBody(emptyToNull(cmd.body()));
        r.setUpdatedAt(System.currentTimeMillis());
        savedRepo.update(r);
        return toView(r);
    }

    public void deleteSaved(String savedId) {
        savedRepo.deleteById(savedId);
    }

    private String resolveName(SaveCommand cmd) {
        if (cmd.name() != null && !cmd.name().isBlank()) return cmd.name().trim();
        if (cmd.url() != null && !cmd.url().isBlank()) {
            String m = cmd.method() == null ? "" : cmd.method().toUpperCase() + " ";
            return (m + cmd.url()).substring(0, Math.min(80, (m + cmd.url()).length()));
        }
        if (cmd.curl() != null && !cmd.curl().isBlank()) {
            return cmd.curl().strip().lines().findFirst().orElse("cURL")
                    .substring(0, Math.min(60, cmd.curl().strip().length()));
        }
        return "未命名请求";
    }

    private String emptyToNull(String s) {
        return (s == null || s.isEmpty()) ? null : s;
    }

    private String serializeHeaders(Map<String, String> headers) {
        if (headers == null || headers.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(headers);
        } catch (Exception e) {
            log.warn("序列化 headers 失败: {}", e.getMessage());
            return null;
        }
    }

    private Map<String, String> deserializeHeaders(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            return objectMapper.readValue(json, HEADERS_TYPE);
        } catch (Exception e) {
            log.warn("反序列化 headers 失败: {}", e.getMessage());
            return new LinkedHashMap<>();
        }
    }

    private SavedRequestView toView(SavedRequest r) {
        return new SavedRequestView(
                r.getId(), r.getSessionId(), r.getName(),
                r.getCurl(), r.getMethod(), r.getUrl(),
                deserializeHeaders(r.getHeadersJson()), r.getBody(),
                r.getCreatedAt(), r.getUpdatedAt());
    }

    public record SaveCommand(String name, String curl, String method, String url,
                              Map<String, String> headers, String body) {}

    public record SavedRequestView(String id, String sessionId, String name,
                                   String curl, String method, String url,
                                   Map<String, String> headers, String body,
                                   long createdAt, long updatedAt) {}

    public BrowserSessionManager.ExecutedResponse execute(String id, ExecuteCommand cmd) {
        repo.findById(id).orElseThrow(() -> new IllegalArgumentException("会话不存在: " + id));
        BrowserSessionManager.ExecuteRequest req = resolveRequest(cmd);
        BrowserSessionManager.ExecutedResponse resp = manager.execute(id, req);
        repo.touchActive(id, System.currentTimeMillis());
        return resp;
    }

    /** 把前端「raw json 或 curl」两种输入归一为 ExecuteRequest。 */
    private BrowserSessionManager.ExecuteRequest resolveRequest(ExecuteCommand cmd) {
        if (cmd.curl() != null && !cmd.curl().isBlank()) {
            CurlParser.ParsedCurl p = CurlParser.parse(cmd.curl());
            return new BrowserSessionManager.ExecuteRequest(p.method(), p.url(), p.headers(), p.body());
        }
        if (cmd.url() == null || cmd.url().isBlank()) {
            throw new IllegalArgumentException("缺少 url");
        }
        String method = (cmd.method() == null || cmd.method().isBlank()) ? "GET" : cmd.method().toUpperCase();
        return new BrowserSessionManager.ExecuteRequest(method, cmd.url(), cmd.headers(), cmd.body());
    }

    public record ExecuteCommand(String curl, String method, String url,
                                 Map<String, String> headers, String body) {}

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
