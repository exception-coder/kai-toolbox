package com.exceptioncoder.toolbox.browserrequest.config;

import com.microsoft.playwright.APIResponse;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.options.Proxy;
import com.microsoft.playwright.options.RequestOptions;
import com.exceptioncoder.toolbox.browserrequest.service.JsCapture;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * 持久 BrowserContext 会话管理器。
 *
 * 与 media-parser 的 PlaywrightManager 区别：
 *   - media-parser：每次调用新建 ctx、用完即销毁（隔离 cookies），适合一次性抓页面
 *   - browser-request：每个 sessionId 对应一个长生命周期 ctx；用户在可见浏览器里登录，
 *     登录态保留在 ctx，后续 HTTP 请求重放都走这个 ctx 的 APIRequestContext，cookies / 头自动随会话走
 *
 * Playwright 不是线程安全的，所有 Playwright 调用必须钉在 worker 线程上。
 */
@Slf4j
@Component
public class BrowserSessionManager {

    private final BrowserRequestProperties props;
    private final ObjectMapper objectMapper;
    private final Path dataDir;
    private final ExecutorService worker;
    private final Map<String, BrowserContext> contexts = new ConcurrentHashMap<>();
    private final Map<String, Page> firstPages = new ConcurrentHashMap<>();
    private final Map<String, JsCapture> captures = new ConcurrentHashMap<>();

    private volatile Playwright playwright;
    private volatile Browser browser;
    private volatile boolean shuttingDown = false;

    public BrowserSessionManager(BrowserRequestProperties props, ObjectMapper objectMapper) {
        this.props = props;
        this.objectMapper = objectMapper;
        String configured = props.getDataDir();
        this.dataDir = (configured == null || configured.isBlank())
                ? Paths.get(System.getProperty("user.home"), ".kai-toolbox", "browser-request")
                : Paths.get(configured);
        try {
            Files.createDirectories(this.dataDir);
        } catch (IOException e) {
            log.warn("[BrowserRequest] 无法创建数据目录 {}: {}", dataDir, e.getMessage());
        }
        this.worker = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "browser-request-worker");
            t.setDaemon(true);
            return t;
        });
    }

    public Path storageStatePath(String sessionId) {
        return dataDir.resolve(sessionId).resolve("storage-state.json");
    }

    public boolean isActive(String sessionId) {
        BrowserContext ctx = contexts.get(sessionId);
        return ctx != null && ctx.browser() != null && ctx.browser().isConnected();
    }

    /** 当前在内存中持有 ctx 的会话 id 集合（含已断连但未清理的，调用方应用 isActive 复检）。 */
    public java.util.Set<String> getOpenSessionIds() {
        return java.util.Set.copyOf(contexts.keySet());
    }

    /** 在 worker 线程上打开/恢复一个 session 的浏览器窗口，并导航到 url。 */
    public void openSession(String sessionId, String url) {
        runOnWorker(() -> {
            ensureBrowser();
            if (contexts.containsKey(sessionId)) {
                BrowserContext exist = contexts.get(sessionId);
                if (exist.browser() != null && exist.browser().isConnected()) {
                    Page p = firstPages.get(sessionId);
                    if (p != null && !p.isClosed()) p.navigate(url);
                    return null;
                }
                contexts.remove(sessionId);
                firstPages.remove(sessionId);
            }
            Path storage = storageStatePath(sessionId);
            Browser.NewContextOptions opts = new Browser.NewContextOptions()
                    .setUserAgent(StealthConfig.UA)
                    .setLocale(StealthConfig.LOCALE)
                    .setTimezoneId(StealthConfig.TIMEZONE)
                    .setBypassCSP(true)
                    .setViewportSize(1440, 900)
                    .setExtraHTTPHeaders(StealthConfig.extraHttpHeaders());
            if (Files.exists(storage)) {
                opts.setStorageStatePath(storage);
                try {
                    log.info("[BrowserRequest] 复用 storage state: {} ({} bytes)",
                            storage, Files.size(storage));
                } catch (IOException ignored) {}
            } else {
                log.info("[BrowserRequest] 无 storage state 文件，将以全新 ctx 打开: {}", sessionId);
            }
            BrowserContext ctx = browser.newContext(opts);
            ctx.setDefaultTimeout(props.getRequestTimeoutMs());
            // 在任何文档执行前注入反检测脚本（覆盖 webdriver / chrome / plugins / WebGL 等）
            ctx.addInitScript(StealthConfig.initScript());
            Page page = ctx.newPage();
            page.navigate(url);
            contexts.put(sessionId, ctx);
            firstPages.put(sessionId, page);
            return null;
        });
    }

    /** 把当前 ctx 的 cookies / localStorage 持久化到 storage-state.json。 */
    public void saveStorageState(String sessionId) {
        runOnWorker(() -> {
            BrowserContext ctx = requireCtx(sessionId);
            Path storage = storageStatePath(sessionId);
            try {
                Files.createDirectories(storage.getParent());
            } catch (IOException e) {
                throw new RuntimeException("无法创建 session 目录: " + e.getMessage(), e);
            }
            ctx.storageState(new BrowserContext.StorageStateOptions().setPath(storage));
            try {
                log.debug("[BrowserRequest] storage state saved: {} ({} bytes)", sessionId, Files.size(storage));
            } catch (IOException ignored) {}
            return null;
        });
    }

    /** 返回 storage state 文件的字节数，文件不存在则返回 null。 */
    public Long storageStateSize(String sessionId) {
        Path p = storageStatePath(sessionId);
        if (!Files.exists(p)) return null;
        try { return Files.size(p); } catch (IOException e) { return null; }
    }

    /** 返回 storage state 文件的最后修改时间（epoch ms），文件不存在则返回 null。 */
    public Long storageStateModified(String sessionId) {
        Path p = storageStatePath(sessionId);
        if (!Files.exists(p)) return null;
        try { return Files.getLastModifiedTime(p).toMillis(); } catch (IOException e) { return null; }
    }

    // ── JS 捕获 ────────────────────────────────────────────────────────────

    /** 该会话的捕获目录（始终返回，无论是否启用）。 */
    public Path captureDir(String sessionId) {
        return dataDir.resolve(sessionId).resolve("captures");
    }

    /** 启动捕获：必须在 ctx 已打开时调用。重复调用会先 stop 再 start 以重置目录。 */
    public void startJsCapture(String sessionId) {
        runOnWorker(() -> {
            BrowserContext ctx = requireCtx(sessionId);
            JsCapture old = captures.remove(sessionId);
            if (old != null) old.stop();
            Path dir = captureDir(sessionId);
            try {
                JsCapture c = JsCapture.start(ctx, dir, objectMapper);
                captures.put(sessionId, c);
            } catch (IOException e) {
                throw new RuntimeException("启动 JS 捕获失败: " + e.getMessage(), e);
            }
            return null;
        });
    }

    public void stopJsCapture(String sessionId) {
        runOnWorker(() -> {
            JsCapture c = captures.remove(sessionId);
            if (c != null) c.stop();
            return null;
        });
    }

    public boolean isJsCaptureActive(String sessionId) {
        return captures.containsKey(sessionId);
    }

    public int jsCaptureCount(String sessionId) {
        JsCapture c = captures.get(sessionId);
        return c == null ? 0 : c.count();
    }

    /**
     * 关闭某会话的 ctx，关之前会尽力保存一次 storage state，避免用户登录完直接点关闭丢登录态。
     * 返回值：close 之前是否成功落盘了 storage state（用于上层同步 DB 的 has_storage）。
     */
    public boolean closeSession(String sessionId) {
        return Boolean.TRUE.equals(runOnWorker(() -> {
            JsCapture cap = captures.remove(sessionId);
            if (cap != null) cap.stop();
            BrowserContext ctx = contexts.remove(sessionId);
            firstPages.remove(sessionId);
            boolean saved = false;
            if (ctx != null) {
                if (ctx.browser() != null && ctx.browser().isConnected()) {
                    try {
                        Path storage = storageStatePath(sessionId);
                        Files.createDirectories(storage.getParent());
                        ctx.storageState(new BrowserContext.StorageStateOptions().setPath(storage));
                        saved = true;
                        log.info("[BrowserRequest] close 前最后保存 storage: {}", sessionId);
                    } catch (Exception e) {
                        log.warn("[BrowserRequest] close 前保存 storage 失败 {}: {}", sessionId, e.getMessage());
                    }
                }
                try { ctx.close(); } catch (Exception e) {
                    log.warn("[BrowserRequest] close ctx {} failed: {}", sessionId, e.getMessage());
                }
            }
            return saved;
        }));
    }

    /** 清除 session 的 storage state 文件。 */
    public void clearStorageState(String sessionId) {
        Path storage = storageStatePath(sessionId);
        try {
            Files.deleteIfExists(storage);
            Path dir = storage.getParent();
            if (dir != null && Files.exists(dir) && isEmpty(dir)) {
                Files.deleteIfExists(dir);
            }
        } catch (IOException e) {
            log.warn("[BrowserRequest] 清理 storage 失败 {}: {}", sessionId, e.getMessage());
        }
    }

    private boolean isEmpty(Path dir) throws IOException {
        try (var s = Files.list(dir)) { return s.findAny().isEmpty(); }
    }

    /** 在 session 的 ctx 内重放 HTTP 请求，返回完整响应。 */
    public ExecutedResponse execute(String sessionId, ExecuteRequest req) {
        return runOnWorker(() -> {
            BrowserContext ctx = requireCtx(sessionId);
            RequestOptions opts = RequestOptions.create()
                    .setMethod(req.method)
                    .setTimeout(props.getRequestTimeoutMs());
            if (req.headers != null) {
                req.headers.forEach(opts::setHeader);
            }
            if (req.body != null && !req.body.isEmpty()
                    && !"GET".equalsIgnoreCase(req.method) && !"HEAD".equalsIgnoreCase(req.method)) {
                opts.setData(req.body);
            }
            APIResponse resp = ctx.request().fetch(req.url, opts);
            try {
                Map<String, String> respHeaders = new HashMap<>();
                resp.headersArray().forEach(h -> respHeaders.merge(h.name, h.value, (a, b) -> a + ", " + b));
                String text;
                byte[] bytes = resp.body();
                int rawLen = bytes == null ? 0 : bytes.length;
                if (bytes == null) {
                    text = "";
                } else {
                    text = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
                }
                return new ExecutedResponse(resp.status(), resp.statusText(), respHeaders, text, rawLen);
            } finally {
                try { resp.dispose(); } catch (Exception ignored) {}
            }
        });
    }

    private BrowserContext requireCtx(String sessionId) {
        BrowserContext ctx = contexts.get(sessionId);
        if (ctx == null) {
            throw new IllegalStateException("会话未打开: " + sessionId + "，请先打开会话");
        }
        return ctx;
    }

    private void ensureBrowser() {
        if (browser != null && browser.isConnected()) return;
        closeBrowserQuietly();
        this.playwright = Playwright.create();
        BrowserType.LaunchOptions opts = new BrowserType.LaunchOptions()
                .setHeadless(props.isHeadless())
                .setArgs(StealthConfig.chromiumArgs())
                .setIgnoreDefaultArgs(StealthConfig.ignoreDefaultArgs());
        if (props.getProxy() != null && !props.getProxy().isBlank()) {
            opts.setProxy(new Proxy(props.getProxy()));
        }
        this.browser = playwright.chromium().launch(opts);
        log.info("[BrowserRequest] Chromium launched (headless={}, stealth=on)", props.isHeadless());
    }

    private void closeBrowserQuietly() {
        if (browser != null) {
            try { browser.close(); } catch (Exception ignored) {}
            browser = null;
        }
        if (playwright != null) {
            try { playwright.close(); } catch (Exception ignored) {}
            playwright = null;
        }
    }

    /** worker 线程上同步执行；调用线程阻塞等待结果。 */
    private <T> T runOnWorker(Supplier<T> task) {
        if (shuttingDown) {
            throw new IllegalStateException("BrowserRequest 正在关闭，拒绝新请求");
        }
        try {
            return worker.submit(task::get).get();
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof RuntimeException re) throw re;
            throw new RuntimeException("BrowserRequest 任务异常: " + cause.getMessage(), cause);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("BrowserRequest 调用被中断", e);
        }
    }

    @PreDestroy
    public void shutdown() {
        shuttingDown = true;
        // 先把还在抓的 JS capture 全部 stop，确保 manifest 落盘完整
        captures.values().forEach(c -> {
            try { c.stop(); } catch (Exception ignored) {}
        });
        captures.clear();
        try {
            worker.submit(() -> {
                contexts.values().forEach(ctx -> {
                    try { ctx.close(); } catch (Exception ignored) {}
                });
                contexts.clear();
                firstPages.clear();
                closeBrowserQuietly();
            }).get(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("[BrowserRequest] worker 优雅关闭失败: {}", e.getMessage());
        }
        worker.shutdown();
        try {
            if (!worker.awaitTermination(5, TimeUnit.SECONDS)) {
                worker.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            worker.shutdownNow();
        }
        log.info("[BrowserRequest] shutdown done");
    }

    public record ExecuteRequest(String method, String url, Map<String, String> headers, String body) {}

    public record ExecutedResponse(int status, String statusText, Map<String, String> headers,
                                   String body, int rawBodyLength) {}
}
