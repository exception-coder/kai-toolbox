package com.exceptioncoder.toolbox.mediaparser.config;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.options.Proxy;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

/**
 * 单例 Chromium 实例 + 线程亲和管理。
 *
 * Playwright 的 API 不是线程安全的（官方文档：should not use a single Playwright instance from
 * multiple threads at the same time），所以这里把所有浏览器调用钉死在一个专属 platform 线程上。
 * Spring 请求线程通过 ExecutorService 提交任务，等待结果——并发请求自动串行化。
 *
 * 同时处理：浏览器进程意外死亡时的懒重启、应用关闭时的优雅清理。
 *
 * 启用条件：toolbox.media-parser.playwright.enabled=true
 * 首次启动会下载 ~150MB 浏览器到 ~/.cache/ms-playwright/。
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "toolbox.media-parser.playwright", name = "enabled", havingValue = "true")
public class PlaywrightManager {

    private static final String UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

    /**
     * 反指纹脚本：在每个 page 加载文档之前注入，覆盖常见的 headless 检测点。
     * 不能让 Cloudflare 的高强度行为分析必过，但能让大部分 JS 端检测失效。
     */
    private static final String STEALTH_SCRIPT = """
            // 1. 隐藏 webdriver 标记
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

            // 2. 伪造非空插件列表（headless 默认为空数组）
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    { name: 'PDF Viewer' },
                    { name: 'Chrome PDF Viewer' },
                    { name: 'Chromium PDF Viewer' },
                    { name: 'Microsoft Edge PDF Viewer' },
                    { name: 'WebKit built-in PDF' }
                ]
            });

            // 3. 多语言列表
            Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });

            // 4. 补齐 window.chrome 对象
            if (!window.chrome) {
                window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {} };
            }

            // 5. permissions.query('notifications') 行为修正
            if (window.navigator.permissions) {
                const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
                window.navigator.permissions.query = (parameters) =>
                    parameters && parameters.name === 'notifications'
                        ? Promise.resolve({ state: Notification.permission })
                        : originalQuery(parameters);
            }

            // 6. WebGL vendor / renderer 伪造
            try {
                const getParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function(parameter) {
                    if (parameter === 37445) return 'Intel Inc.';
                    if (parameter === 37446) return 'Intel Iris OpenGL Engine';
                    return getParameter.call(this, parameter);
                };
            } catch (e) {}

            // 7. headless 下 outerHeight/Width 兜底
            try {
                if (window.outerHeight === 0) Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });
                if (window.outerWidth === 0)  Object.defineProperty(window, 'outerWidth',  { get: () => window.innerWidth  });
            } catch (e) {}
            """;

    private final MediaParserProperties props;
    private final ProxyConfig proxyConfig;
    /** 所有 Playwright 操作都钉在这一个线程上。Daemon 不阻塞 JVM 退出。 */
    private final ExecutorService worker;

    private volatile Playwright playwright;
    private volatile Browser browser;
    private volatile boolean ready = false;
    private volatile String initError;
    private volatile boolean shuttingDown = false;

    public PlaywrightManager(MediaParserProperties props, ProxyConfig proxyConfig) {
        this.props = props;
        this.proxyConfig = proxyConfig;
        this.worker = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "playwright-worker");
            t.setDaemon(true);
            return t;
        });
        // 异步初始化：避免 Spring 启动被 Chromium 启动时间阻塞（首次还要下载 ~150MB）
        worker.submit(this::initBrowser);
    }

    /** 在 worker 线程上启动 / 重启 Chromium。 */
    private void initBrowser() {
        ready = false;
        initError = null;
        // 清理旧实例（重启场景）
        closeQuietly();

        try {
            this.playwright = Playwright.create();
            BrowserType.LaunchOptions opts = new BrowserType.LaunchOptions()
                    .setHeadless(props.getPlaywright().isHeadless())
                    .setArgs(List.of(
                            "--disable-blink-features=AutomationControlled",
                            "--disable-features=IsolateOrigins,site-per-process,AutomationControlled",
                            "--disable-site-isolation-trials",
                            "--no-default-browser-check",
                            "--no-first-run",
                            "--password-store=basic",
                            "--use-mock-keychain",
                            "--no-sandbox"
                    ))
                    .setIgnoreDefaultArgs(List.of("--enable-automation"));
            if (proxyConfig.isEnabled()) {
                opts.setProxy(new Proxy(proxyConfig.getRawUrl()));
            }
            this.browser = playwright.chromium().launch(opts);
            this.ready = true;
            log.info("[Playwright] Chromium launched (headless={}, proxy={})",
                    props.getPlaywright().isHeadless(),
                    proxyConfig.isEnabled() ? proxyConfig.getRawUrl() : "none");
        } catch (Exception e) {
            this.initError = e.getMessage();
            log.error("[Playwright] 启动失败，相关 fallback parser 将不可用: {}", e.getMessage(), e);
        }
    }

    public boolean isReady() {
        return ready && browser != null && browser.isConnected();
    }

    /**
     * 借一个全新 BrowserContext + Page 跑闭包，结束后自动清理（隔离 cookies）。
     * 调用线程会被阻塞直到 worker 线程跑完任务；并发请求自动串行化。
     */
    public <T> T withPage(Function<Page, T> fn) {
        if (shuttingDown) {
            throw new RuntimeException("Playwright 正在关闭，拒绝新请求");
        }
        try {
            return worker.submit(() -> runOnWorker(fn)).get();
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof RuntimeException re) throw re;
            throw new RuntimeException("Playwright 任务异常: " + cause.getMessage(), cause);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Playwright 调用被中断", e);
        }
    }

    /** 在 worker 线程上执行：检查浏览器存活 → 必要时重启 → 创建 ctx/page → 跑闭包。 */
    private <T> T runOnWorker(Function<Page, T> fn) {
        if (browser == null || !browser.isConnected()) {
            log.warn("[Playwright] browser disconnected (or never started), relaunching");
            initBrowser();
            if (!ready) {
                throw new RuntimeException("Playwright 不可用: " + (initError != null ? initError : "未启动"));
            }
        }

        try (BrowserContext ctx = browser.newContext(new Browser.NewContextOptions()
                .setUserAgent(UA)
                .setViewportSize(390, 844)
                .setLocale("zh-CN")
                .setTimezoneId("Asia/Shanghai")
                .setExtraHTTPHeaders(Map.of(
                        "Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8"
                )))) {
            ctx.setDefaultTimeout(props.getPlaywright().getPageTimeoutMs());
            ctx.addInitScript(STEALTH_SCRIPT);
            try (Page page = ctx.newPage()) {
                return fn.apply(page);
            }
        }
    }

    private void closeQuietly() {
        if (browser != null) {
            try { browser.close(); } catch (Exception ignored) {}
            browser = null;
        }
        if (playwright != null) {
            try { playwright.close(); } catch (Exception ignored) {}
            playwright = null;
        }
    }

    @PreDestroy
    public void shutdown() {
        shuttingDown = true;
        // 关闭操作必须在 worker 线程上执行，否则会触发 Playwright 的线程检查
        try {
            worker.submit(this::closeQuietly).get(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("[Playwright] worker 优雅关闭失败: {}", e.getMessage());
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
        log.info("[Playwright] shutdown done");
    }
}
