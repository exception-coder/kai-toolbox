package com.exceptioncoder.toolbox.browserrequest.service;

import com.exceptioncoder.toolbox.browserrequest.config.BrowserRequestProperties;
import com.exceptioncoder.toolbox.browserrequest.domain.HttpCall;
import com.exceptioncoder.toolbox.browserrequest.domain.enums.ResourceType;
import com.exceptioncoder.toolbox.browserrequest.repository.HttpCallRepository;
import com.exceptioncoder.toolbox.browserrequest.repository.RecordingRepository;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.google.gson.JsonObject;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.CDPSession;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Request;
import com.microsoft.playwright.Response;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

/**
 * 单 BrowserContext 全 HTTP 录制器。监听 {@link BrowserContext#onResponse} 同步取 body，
 * 异步写库 + 推 SSE。线程模型：Playwright 回调跑在 BrowserSessionManager 的 worker 线程，
 * 落库 + SSE 派发跑在 HttpRecorder 自己的单线程 writer 上，避免阻塞 Playwright worker。
 *
 * 多个 session 共享一个 HttpRecorder bean；每个 session 的状态隔离在 {@link Session} 内部对象里。
 */
@Slf4j
@Component
public class HttpRecorder {

    private final BrowserRequestProperties props;
    private final HttpCallRepository callRepo;
    private final RecordingRepository recordingRepo;
    private final SseEmitterRegistry sseRegistry;

    /** sessionId → 当前活跃录制状态。null 表示未在录。 */
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();

    /** 全 recorder 共享单线程 writer：所有 SQLite 写入串行化，规避并发写冲突。 */
    private final ExecutorService writer;

    public HttpRecorder(BrowserRequestProperties props,
                        HttpCallRepository callRepo,
                        RecordingRepository recordingRepo,
                        SseEmitterRegistry sseRegistry) {
        this.props = props;
        this.callRepo = callRepo;
        this.recordingRepo = recordingRepo;
        this.sseRegistry = sseRegistry;
        this.writer = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "browser-request-recorder-writer");
            t.setDaemon(true);
            return t;
        });
    }

    /** 在 ctx 上挂监听。同 sessionId 重复调用：先 detach 旧的再挂新的。 */
    public void attach(String sessionId, String recordingId, CaptureFilter filter, BrowserContext ctx) {
        detach(sessionId);
        Session s = new Session(sessionId, recordingId, filter, ctx);
        ctx.onResponse(s.responseHandler);
        // 禁掉 HTTP cache，让 onResponse 能看到所有请求（否则 long-cache 站会大量静默命中）
        int pageCount = 0;
        for (Page p : ctx.pages()) {
            s.disableCacheOnPage(p);
            pageCount++;
        }
        ctx.onPage(s.pageHandler);
        sessions.put(sessionId, s);
        log.info("[HttpRecorder] attached sessionId={} recordingId={} filter={} initialPages={}",
                sessionId, recordingId, filter, pageCount);
        if (pageCount == 0) {
            log.warn("[HttpRecorder] ctx 没有 Page！onResponse 不会触发——确认 Playwright 浏览器窗口还开着 sessionId={}", sessionId);
        }
    }

    /**
     * 单次录制的运行期参数。由 RecordingService 套完默认值 + 夹到后端硬上限后传进来，
     * 运行期不再变。
     *
     * - 4 个 boolean：哪几类资源入库
     * - responseBodyTruncateAtBytes：响应体存多大就截到多少。最终用 min(本值, props.maxBytes)。
     */
    public record CaptureFilter(
            boolean xhr,
            boolean fetch,
            boolean document,
            boolean script,
            int responseBodyTruncateAtBytes
    ) {
        public boolean allow(ResourceType rt) {
            return switch (rt) {
                case XHR -> xhr;
                case FETCH -> fetch;
                case DOCUMENT -> document;
                case SCRIPT -> script;
            };
        }
    }

    /** 摘监听。已不在录的 session 调用是 no-op。返回此次录到的 call 数。 */
    public int detach(String sessionId) {
        Session s = sessions.remove(sessionId);
        if (s == null) return 0;
        try {
            s.ctx.offResponse(s.responseHandler);
        } catch (Exception ignored) {
        }
        try {
            s.ctx.offPage(s.pageHandler);
        } catch (Exception ignored) {
        }
        // 恢复 cache 行为给后续非录制场景
        for (CDPSession cdp : s.cdpSessions) {
            try {
                JsonObject p = new JsonObject();
                p.addProperty("cacheDisabled", false);
                cdp.send("Network.setCacheDisabled", p);
            } catch (Exception ignored) {
            }
            try { cdp.detach(); } catch (Exception ignored) {}
        }
        s.cdpSessions.clear();
        int n = s.seq.get();
        log.info("[HttpRecorder] detached sessionId={} recordingId={} totalCalls={}",
                sessionId, s.recordingId, n);
        return n;
    }

    /** 当前是否在录该 session。 */
    public boolean isActive(String sessionId) {
        return sessions.containsKey(sessionId);
    }

    /** 当前已录调用数；未在录返回 0。 */
    public int callCount(String sessionId) {
        Session s = sessions.get(sessionId);
        return s == null ? 0 : s.seq.get();
    }

    /** Spring 关闭时停 writer。 */
    public void shutdown() {
        sessions.clear();
        writer.shutdown();
        try {
            if (!writer.awaitTermination(5, TimeUnit.SECONDS)) writer.shutdownNow();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            writer.shutdownNow();
        }
    }

    // ── 单 session 录制状态 ────────────────────────────────────────────────

    private class Session {
        final String sessionId;
        final String recordingId;
        final CaptureFilter filter;
        final BrowserContext ctx;
        final AtomicInteger seq = new AtomicInteger(0);
        final Consumer<Response> responseHandler;
        final Consumer<Page> pageHandler;
        final List<CDPSession> cdpSessions = new ArrayList<>();

        Session(String sessionId, String recordingId, CaptureFilter filter, BrowserContext ctx) {
            this.sessionId = sessionId;
            this.recordingId = recordingId;
            this.filter = filter;
            this.ctx = ctx;
            this.responseHandler = this::onResponse;
            this.pageHandler = this::disableCacheOnPage;
        }

        void disableCacheOnPage(Page page) {
            try {
                CDPSession cdp = ctx.newCDPSession(page);
                cdp.send("Network.enable");
                JsonObject params = new JsonObject();
                params.addProperty("cacheDisabled", true);
                cdp.send("Network.setCacheDisabled", params);
                cdpSessions.add(cdp);
            } catch (Exception e) {
                log.debug("[HttpRecorder] 禁 cache 失败（非致命）: {}", e.getMessage());
            }
        }

        /**
         * Playwright worker 线程上同步回调。性能关键路径——每一行都直接影响浏览器卡顿，
         * 原则：
         *   1. 只用同步 cached 方法（`headers()`/`method()`/`url()`/`status()` 等），不调 IPC 版本（`allHeaders()`/`headersArray()`）
         *   2. 通过 cached headers 的 `content-length` 预判 body 大小，超阈值直接不调 `resp.body()`
         *   3. 仅写方法（POST/PUT/PATCH/DELETE）才读 request body
         *   4. 通过 CaptureFilter 控制 XHR / FETCH / DOCUMENT / SCRIPT 哪几类入库
         *   5. 304 / 30x 不读 body（缓存命中或重定向链中间响应）
         */
        void onResponse(Response resp) {
            try {
                Request req = resp.request();
                String rtRaw = req.resourceType();
                String urlForLog = null;
                try { urlForLog = briefUrl(req.url()); } catch (Exception ignored) {}
                // 诊断日志：先无条件确认 onResponse 触发；再标注是被 ResourceType 过滤还是被 filter 拒
                ResourceType rt = ResourceType.fromPlaywright(rtRaw);
                if (rt == null) {
                    log.debug("[HttpRecorder] 跳过 不支持的资源类型 rtRaw={} url={}", rtRaw, urlForLog);
                    return;
                }
                if (!filter.allow(rt)) {
                    log.debug("[HttpRecorder] 跳过 filter 不收 rt={} url={}", rt, urlForLog);
                    return;
                }

                String method = req.method();
                String url = req.url();
                long startedAt = System.currentTimeMillis();
                Integer status = null;
                try { status = resp.status(); } catch (Exception ignored) {}
                // 304 缓存命中：没 body 不必录；30x 重定向中间响应：body 取不到容易抛错
                if (status != null && status == 304) return;

                // 用 cached `headers()` 替代 IPC 的 `allHeaders()` / `headersArray()`，省 2 次 IPC
                Map<String, String> reqHeaders = new HashMap<>();
                try { reqHeaders.putAll(req.headers()); } catch (Exception ignored) {}
                Map<String, String> respHeaders = new HashMap<>();
                try { respHeaders.putAll(resp.headers()); } catch (Exception ignored) {}

                // 仅写方法读 request body：GET/HEAD/OPTIONS/DELETE 直接跳过 postData() IPC
                String requestBodyText = isWriteMethod(method) ? readRequestBody(req) : null;
                boolean sensitive = isSensitive(url, requestBodyText);
                if (sensitive) requestBodyText = null;

                // response body 处理：
                //   1. 安全网：cached content-length 已知 > 后端硬上限（maxBytes），直接跳过——防止
                //      数十/上百 MB 的文件下载阻塞 Playwright worker
                //   2. 否则调 resp.body() 拿到字节：≤ truncateAt 整存；> truncateAt 截前 truncateAt
                //      字节并打 truncated=true
                // truncateAt 由前端 RecordingPanel 选定（已在 RecordingService.start 夹到 maxBytes 之内）
                String responseBodyText = null;
                boolean truncated = false;
                int bodyBytes = 0;
                long bodyReadMs = 0;
                boolean skippedByMaxBytes = false;
                boolean isRedirect = status != null && status >= 300 && status < 400;
                if (!sensitive && !isRedirect) {
                    long advertisedLen = parseContentLength(respHeaders);
                    int truncateAt = filter.responseBodyTruncateAtBytes();
                    int maxBytes = props.getResponseBodyMaxBytes();
                    if (advertisedLen >= 0 && advertisedLen > maxBytes) {
                        // 已知超大，根本不调 body() —— 这是去卡顿的关键
                        skippedByMaxBytes = true;
                        log.info("[HttpRecorder] 跳过大响应 advertisedLen={}B maxBytes={}B url={}",
                                advertisedLen, maxBytes, briefUrl(url));
                    } else {
                        long t0 = System.nanoTime();
                        try {
                            byte[] bytes = resp.body();
                            bodyReadMs = (System.nanoTime() - t0) / 1_000_000L;
                            if (bytes != null && bytes.length > 0) {
                                bodyBytes = bytes.length;
                                if (bytes.length <= truncateAt) {
                                    responseBodyText = new String(bytes, StandardCharsets.UTF_8);
                                } else {
                                    responseBodyText = new String(bytes, 0, truncateAt, StandardCharsets.UTF_8);
                                    truncated = true;
                                }
                            }
                        } catch (Exception e) {
                            bodyReadMs = (System.nanoTime() - t0) / 1_000_000L;
                            log.warn("[HttpRecorder] body 取失败 ({}ms) {}: {}", bodyReadMs, briefUrl(url), e.getMessage());
                        }
                    }
                }

                Integer elapsedMs = null;

                // 把本次抓取的关键信号打出来：方便用户排查「白屏到底是录制慢还是站点慢」
                //   - 正常：INFO 一行（方便实时看到捕获节奏），太吵可降为 WARN-only
                //   - body() 读取 > 200ms：WARN，明确告知此次抓取在拖慢浏览器
                //   - 跳过 maxBytes：上文已 INFO
                if (!skippedByMaxBytes) {
                    String line = "{} #{} {} {} status={} bodyBytes={} truncated={} bodyReadMs={} url={}";
                    String tag = bodyReadMs > 200 ? "[HttpRecorder] 慢响应抓取" : "[HttpRecorder] captured";
                    Object[] args = { tag, seq.get() + 1, rt, method, status, bodyBytes, truncated, bodyReadMs, briefUrl(url) };
                    if (bodyReadMs > 200) log.warn(line, args);
                    else log.info(line, args);
                }

                int s = seq.incrementAndGet();
                if (s > props.getRecordingMaxCalls()) {
                    // 触达硬上限：忽略本条 + 不再递增（由 RecordingService 的超时检测做 STOP 决策）
                    seq.decrementAndGet();
                    return;
                }

                HttpCall call = new HttpCall(
                        UUID.randomUUID().toString(),
                        recordingId,
                        s,
                        method,
                        url,
                        rt,
                        reqHeaders,
                        requestBodyText,
                        status,
                        respHeaders,
                        responseBodyText,
                        truncated,
                        sensitive,
                        startedAt,
                        elapsedMs,
                        safeFrameUrl(req)
                );

                // 异步落库 + 推 SSE，不阻塞 Playwright worker
                writer.submit(() -> flush(call));
            } catch (Exception e) {
                log.warn("[HttpRecorder] onResponse 处理异常 {}: {}", resp.url(), e.getMessage());
            }
        }

        String readRequestBody(Request req) {
            try {
                String body = req.postData();
                if (body == null) return null;
                // 限制请求体大小：>1MB 截断
                if (body.length() > 1024 * 1024) return body.substring(0, 1024 * 1024);
                return body;
            } catch (Exception e) {
                return null;
            }
        }

        String safeFrameUrl(Request req) {
            try {
                return req.frame() != null ? req.frame().url() : null;
            } catch (Exception e) {
                return null;
            }
        }
    }

    private void flush(HttpCall call) {
        try {
            callRepo.insert(call);
            recordingRepo.incrementCallCount(call.recordingId(), 1);
            // 推 SSE：仅推轻量视图（不含 body）
            Map<String, Object> view = new HashMap<>();
            view.put("id", call.id());
            view.put("recordingId", call.recordingId());
            view.put("seq", call.seq());
            view.put("method", call.method());
            view.put("url", call.url());
            view.put("resourceType", call.resourceType().name());
            view.put("status", call.status());
            view.put("elapsedMs", call.elapsedMs());
            view.put("startedAt", call.startedAt());
            view.put("responseTruncated", call.responseTruncated());
            view.put("sensitive", call.sensitive());
            sseRegistry.publish("recording:" + call.recordingId(), "call", view);
        } catch (Exception e) {
            log.warn("[HttpRecorder] flush 失败 callId={} url={}: {}",
                    call.id(), call.url(), e.getMessage());
        }
    }

    /** 写方法才有请求体。GET/HEAD/OPTIONS/DELETE 跳过 postData() IPC 调用。 */
    static boolean isWriteMethod(String method) {
        if (method == null) return false;
        return switch (method.toUpperCase(Locale.ROOT)) {
            case "POST", "PUT", "PATCH" -> true;
            default -> false;
        };
    }

    /** 从 cached response headers 读 content-length；缺失或非法返回 -1。 */
    static long parseContentLength(Map<String, String> respHeaders) {
        if (respHeaders == null) return -1;
        for (Map.Entry<String, String> e : respHeaders.entrySet()) {
            if (e.getKey().equalsIgnoreCase("content-length")) {
                try { return Long.parseLong(e.getValue().trim()); }
                catch (Exception ex) { return -1; }
            }
        }
        return -1;
    }

    /** URL 太长就只留前 120 字符 + …，避免日志被一长串 query string 撑爆。 */
    static String briefUrl(String url) {
        if (url == null) return "(null)";
        return url.length() <= 120 ? url : url.substring(0, 120) + "…";
    }

    boolean isSensitive(String url, String requestBody) {
        String[] keywords = props.getSensitiveKeywords();
        if (keywords == null || keywords.length == 0) return false;
        String u = url == null ? "" : url.toLowerCase(Locale.ROOT);
        String b = requestBody == null ? "" : requestBody.toLowerCase(Locale.ROOT);
        for (String kw : keywords) {
            if (kw == null || kw.isBlank()) continue;
            String k = kw.toLowerCase(Locale.ROOT);
            if (u.contains(k) || b.contains(k)) return true;
        }
        return false;
    }
}
