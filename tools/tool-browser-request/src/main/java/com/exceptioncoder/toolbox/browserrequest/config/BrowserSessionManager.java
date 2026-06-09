package com.exceptioncoder.toolbox.browserrequest.config;

import com.microsoft.playwright.APIResponse;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.options.Proxy;
import com.microsoft.playwright.options.RequestOptions;
import com.microsoft.playwright.options.WaitUntilState;
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
    private volatile Playwright playwright;
    private volatile Browser browser;
    private volatile boolean shuttingDown = false;

    /**
     * 反 BOSS zpAegis 潰页「全覆盖守卫 + 日志」：潰成 about:blank 全是 JS 操作，这里把所有可能的路径
     * 一网打尽——能挡的（window.open / location.assign / location.replace / document.write 空写）直接
     * 挡掉并 log，挡不住的（location.href= 的 setter 无法覆盖）用 beforeunload 兜住时机 + 调用栈。
     * 所有动作经 console.error 走后端 onConsoleMessage 落日志，[BLANKGUARD] 行即可定位它到底走哪条路。
     * toString 伪装原生，降低被 Function.prototype.toString 校验识破概率。
     */
    private static final String BLANK_GUARD_JS =
            "(function(){try{"
            + "var T='[BLANKGUARD]';"
            + "var log=function(m){try{console.error(T+' '+m+' @ '+(((new Error()).stack)||'').replace(/\\n/g,' || '));}catch(e){}};"
            + "var isBlank=function(u){var s=(u==null)?'':String(u);return s===''||/^about:/i.test(s);};"
            + "var nat=function(f,n){try{f.toString=function(){return 'function '+n+'() { [native code] }';};}catch(e){}};"
            + "var _open=window.open;"
            + "var openG=function(u){if(isBlank(u)){log('BLOCK window.open('+u+')');return {closed:false,close:function(){},focus:function(){},blur:function(){},opener:null,location:{href:'',assign:function(){},replace:function(){},reload:function(){}},document:{open:function(){},write:function(){},close:function(){}},postMessage:function(){}};}return _open.apply(this,arguments);};"
            + "nat(openG,'open');window.open=openG;"
            + "try{var _as=Location.prototype.assign;var asG=function(u){if(isBlank(u)){log('BLOCK location.assign('+u+')');return;}return _as.apply(this,arguments);};nat(asG,'assign');Location.prototype.assign=asG;}catch(e){}"
            + "try{var _rp=Location.prototype.replace;var rpG=function(u){if(isBlank(u)){log('BLOCK location.replace('+u+')');return;}return _rp.apply(this,arguments);};nat(rpG,'replace');Location.prototype.replace=rpG;}catch(e){}"
            + "try{var _dw=document.write;document.write=function(s){if(!s||String(s).trim()===''){log('BLOCK document.write(empty)');return;}return _dw.apply(this,arguments);};}catch(e){}"
            + "try{var _ps=history.pushState;history.pushState=function(){log('history.pushState '+arguments[2]);return _ps.apply(this,arguments);};}catch(e){}"
            + "try{var _rs=history.replaceState;history.replaceState=function(){log('history.replaceState '+arguments[2]);return _rs.apply(this,arguments);};}catch(e){}"
            + "try{var _rm=Element.prototype.remove;Element.prototype.remove=function(){if(this===document.documentElement||this===document.body){log('documentElement/body.remove()');}return _rm.apply(this,arguments);};}catch(e){}"
            + "window.addEventListener('beforeunload',function(){log('beforeunload from='+location.href);},true);"
            + "}catch(e){}})();";

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
                    if (p != null && !p.isClosed()) navigateAndLog(sessionId, p, url);
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
            ctx.setDefaultNavigationTimeout(props.getRequestTimeoutMs());
            // 在任何文档执行前注入反检测脚本（覆盖 webdriver / chrome / plugins / WebGL 等）
            ctx.addInitScript(StealthConfig.initScript());
            // 反 zpAegis 潰页：全覆盖守卫 + 日志，挡掉/记录所有把当前帧导成 about:blank 的 JS 路径。
            ctx.addInitScript(BLANK_GUARD_JS);
            Page page = ctx.newPage();
            // 诊断：记录主框架每次导航落点。用于区分"加载后被站点重定向回 about:blank"（反爬）
            // 与"导航本身没成功"——前者会看到先 bosszhipin 后 about:blank 两条 frame navigated。
            page.onFrameNavigated(frame -> {
                if (frame == page.mainFrame()) {
                    log.info("[BrowserRequest] frame navigated session={} url={}", sessionId, frame.url());
                }
            });
            // 诊断：页面 JS 报错 / 控制台 error。白屏但已落 bosszhipin 时，用于判断是 JS 异常中断渲染
            // 还是反爬把 DOM 清空（反爬通常无明显 JS error，而是 location/innerHTML 操作）。
            page.onConsoleMessage(m -> {
                if ("error".equals(m.type())) {
                    log.info("[BrowserRequest] console.error session={} text={}", sessionId, m.text());
                }
            });
            page.onPageError(err -> log.warn("[BrowserRequest] pageerror session={} err={}", sessionId, err));
            // 先导航、再装风控拦截器：ctx.route("**\/*", ...) 会接管初始文档加载链路，
            // 即使放行导航请求，海量子资源经 route.fetch 重放也可能拖垮/破坏首屏，导致页面停在 about:blank。
            // 初始 HTML 不含风控码（只在加载后的 XHR 出现），故导航完成后再装拦截器，既不漏风控又不干扰首屏。
            navigateAndLog(sessionId, page, url);
            // 默认关闭：拦截器对每个 XHR 做 route.fetch 服务端重放，经代理对 zhipin 域易超时/失败，
            // 且增大内存与延迟（实测引发渲染进程 OOM 白屏）。仅 toolbox.browser-request.boss-risk-bypass=true
            // 且为 zhipin 系 URL 时才装。未触发风控时不需要它。
            if (props.isBossRiskBypass() && BossRiskBypass.isZhipinUrl(url)) {
                BossRiskBypass.install(ctx, objectMapper);
            }
            contexts.put(sessionId, ctx);
            firstPages.put(sessionId, page);
            return null;
        });
    }

    /**
     * 导航并记录落点 URL。用 DOMCONTENTLOADED 而非默认 load，避免被慢子资源拖到超时；
     * 失败不抛（否则 openSession 半途中断、ctx 不入表泄漏），改为记录 landed=page.url() + 异常，
     * 便于排查"点开停在 about:blank"到底是导航没成功、超时、还是被站点重定向。
     */
    private void navigateAndLog(String sessionId, Page page, String url) {
        // 间歇性「停在 about:blank」根因：page.navigate 紧跟 ctx.newPage()，偶发与 Chromium 初始
        // about:blank 文档提交竞争，导致这次导航没真正发起（DOMCONTENTLOADED 落在了初始空文档上，
        // 不抛异常但 page.url() 仍是 about:blank，且不产生任何网络请求）。重试至落点离开 about:blank。
        Exception last = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                page.navigate(url, new Page.NavigateOptions().setWaitUntil(WaitUntilState.DOMCONTENTLOADED));
                String landed = safeUrl(page);
                if (!landed.startsWith("about:")) {
                    log.info("[BrowserRequest] navigate ok session={} target={} landed={} attempt={} title=[{}] htmlLen={}",
                            sessionId, url, landed, attempt, safeTitle(page), safeContentLen(page));
                    return;
                }
                log.warn("[BrowserRequest] navigate 落在 {}（第 {}/3 次），重试 session={}", landed, attempt, sessionId);
            } catch (Exception e) {
                last = e;
                log.warn("[BrowserRequest] navigate 第 {}/3 次异常 session={} err={}", attempt, sessionId, e.toString());
            }
            try { page.waitForTimeout(300); } catch (Exception ignored) {}
        }
        log.error("[BrowserRequest] navigate 最终失败 session={} target={} landed={} lastErr={}",
                sessionId, url, safeUrl(page), last == null ? "(landed 仍为 about:blank)" : last.toString());
    }

    private static String safeUrl(Page page) {
        try { return page.url(); } catch (Exception e) { return "?"; }
    }

    private static String safeTitle(Page page) {
        try { return page.title(); } catch (Exception e) { return "?"; }
    }

    /** 渲染后 HTML 长度——白屏时若 htmlLen 很小说明 DOM 基本是空的（反爬清空/未渲染）。 */
    private static int safeContentLen(Page page) {
        try { return page.content().length(); } catch (Exception e) { return -1; }
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

    /**
     * 关闭某会话的 ctx，关之前会尽力保存一次 storage state，避免用户登录完直接点关闭丢登录态。
     * 返回值：close 之前是否成功落盘了 storage state（用于上层同步 DB 的 has_storage）。
     */
    public boolean closeSession(String sessionId) {
        return Boolean.TRUE.equals(runOnWorker(() -> {
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

    /**
     * 在 worker 线程内拿到指定 session 的 ctx 给 task 用。
     * 录制/回放等需要操作 Playwright API 的模块通过本入口保证线程安全。
     */
    public <T> T runWithCtx(String sessionId, java.util.function.Function<BrowserContext, T> task) {
        return runOnWorker(() -> task.apply(requireCtx(sessionId)));
    }

    /** 在 session 的 ctx 内重放 HTTP 请求，返回完整响应。 */
    public ExecutedResponse execute(String sessionId, ExecuteRequest req) {
        return runOnWorker(() -> {
            BrowserContext ctx = requireCtx(sessionId);
            RequestOptions opts = RequestOptions.create()
                    .setMethod(req.method)
                    .setTimeout(props.getRequestTimeoutMs())
                    // 显式设 maxRedirects——APIRequestContext 默认会跟随 30x，这里只是把行为固定下来
                    .setMaxRedirects(20)
                    // 30x/4xx/5xx 也不抛异常，让上层完整看到响应内容（包括 Location 头）
                    .setFailOnStatusCode(false);
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
                byte[] bytes;
                try {
                    bytes = resp.body();
                } catch (Exception e) {
                    // 30x 重定向链的中间响应没 body 时 .body() 可能抛——降级返回空
                    bytes = null;
                }
                int rawLen = bytes == null ? 0 : bytes.length;
                text = bytes == null ? "" : new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
                String finalUrl;
                try { finalUrl = resp.url(); } catch (Exception e) { finalUrl = req.url; }
                if (!req.url.equals(finalUrl)) {
                    log.info("[BrowserRequest] 请求被重定向: {} → {}", req.url, finalUrl);
                }
                return new ExecutedResponse(resp.status(), resp.statusText(), respHeaders,
                        text, rawLen, finalUrl);
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
                                   String body, int rawBodyLength, String finalUrl) {}
}
