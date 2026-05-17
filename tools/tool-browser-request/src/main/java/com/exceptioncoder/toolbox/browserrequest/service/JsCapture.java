package com.exceptioncoder.toolbox.browserrequest.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Response;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

/**
 * 单个 BrowserContext 的 JS 捕获句柄。
 *
 * 工作方式：注册 {@link BrowserContext#onResponse(Consumer)} 监听，对 .js 响应同步取 body
 * （Playwright 限制：handler 返回后 response 可能失效），byte[] + 元数据塞进异步队列，由
 * 独立单线程 writer 落盘 —— 这样 Playwright worker 线程只承担 .body() 短阻塞，不背 IO。
 *
 * 文件结构：
 * <pre>
 *   {dir}/
 *     manifest.json       —— [{url, status, contentType, size, savedAs, savedAt}, ...]
 *     scripts/
 *       www.zhipin.com_main_xxxx.js
 *       static.zhipin.com_security_xxxx.js
 *       ...
 * </pre>
 */
@Slf4j
public class JsCapture {

    private static final int MAX_FILES = 2000;
    private static final long MAX_BYTES_PER_FILE = 8 * 1024 * 1024;

    private final BrowserContext ctx;
    private final Path dir;
    private final Path scriptsDir;
    private final Path manifestFile;
    private final ObjectMapper objectMapper;
    private final Consumer<Response> handler;
    private final ExecutorService writer;
    private final AtomicInteger count = new AtomicInteger();
    private final List<Entry> entries = Collections.synchronizedList(new ArrayList<>());
    private volatile boolean stopped = false;

    private JsCapture(BrowserContext ctx, Path dir, ObjectMapper objectMapper) {
        this.ctx = ctx;
        this.dir = dir;
        this.scriptsDir = dir.resolve("scripts");
        this.manifestFile = dir.resolve("manifest.json");
        this.objectMapper = objectMapper;
        this.writer = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "js-capture-writer");
            t.setDaemon(true);
            return t;
        });
        this.handler = this::onResponse;
    }

    /** 在指定 ctx 上启动捕获并落盘到 {@code dir}。若 dir 已存在 manifest 会被覆盖。 */
    public static JsCapture start(BrowserContext ctx, Path dir, ObjectMapper objectMapper) throws IOException {
        Files.createDirectories(dir.resolve("scripts"));
        JsCapture c = new JsCapture(ctx, dir, objectMapper);
        ctx.onResponse(c.handler);
        log.info("[JsCapture] 启动捕获 -> {}", dir);
        return c;
    }

    public void stop() {
        if (stopped) return;
        stopped = true;
        try { ctx.offResponse(handler); } catch (Exception ignored) {}
        // 等剩余落盘结束 + 刷一次 manifest
        writer.shutdown();
        try {
            writer.awaitTermination(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        flushManifest();
        log.info("[JsCapture] 停止，共捕获 {} 个 JS 文件", count.get());
    }

    public int count() { return count.get(); }
    public Path directory() { return dir; }

    // ── 内部：onResponse handler ─────────────────────────────────────────

    private void onResponse(Response resp) {
        if (stopped) return;
        try {
            String url = resp.url();
            String ct = resp.headerValue("content-type");
            boolean isJs = isJavaScript(url, ct);
            if (!isJs) return;
            if (count.get() >= MAX_FILES) return;

            byte[] body;
            try {
                body = resp.body();
            } catch (Exception e) {
                // 部分 cross-origin / failed 响应取不到 body
                return;
            }
            if (body == null || body.length == 0) return;
            if (body.length > MAX_BYTES_PER_FILE) {
                log.debug("[JsCapture] 跳过过大 JS: {} ({} bytes)", url, body.length);
                return;
            }

            int status = resp.status();
            // 写盘卸到独立线程，handler 立刻返回
            writer.submit(() -> persist(url, status, ct, body));
        } catch (Exception e) {
            log.debug("[JsCapture] handler 异常: {}", e.getMessage());
        }
    }

    private void persist(String url, int status, String contentType, byte[] body) {
        try {
            String fileName = makeFileName(url, count.incrementAndGet());
            Path target = scriptsDir.resolve(fileName);
            Files.write(target, body,
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
            entries.add(new Entry(url, status, contentType, body.length, "scripts/" + fileName,
                    System.currentTimeMillis()));
            // 每 20 条刷一次 manifest，结束时 stop() 再 flush 一次
            if (entries.size() % 20 == 0) flushManifest();
        } catch (Exception e) {
            log.warn("[JsCapture] 写盘失败 {}: {}", url, e.getMessage());
        }
    }

    private void flushManifest() {
        try {
            List<Entry> snapshot;
            synchronized (entries) { snapshot = new ArrayList<>(entries); }
            byte[] json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(snapshot);
            Files.write(manifestFile, json,
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
        } catch (Exception e) {
            log.warn("[JsCapture] manifest 写盘失败: {}", e.getMessage());
        }
    }

    // ── 工具方法 ─────────────────────────────────────────────────────────

    private static boolean isJavaScript(String url, String contentType) {
        if (contentType != null) {
            String c = contentType.toLowerCase();
            if (c.contains("javascript") || c.contains("ecmascript")) return true;
        }
        if (url != null) {
            // 去掉 query 部分再看后缀
            int q = url.indexOf('?');
            String path = q >= 0 ? url.substring(0, q) : url;
            return path.endsWith(".js") || path.endsWith(".mjs");
        }
        return false;
    }

    /** host + 路径转义生成可读但安全的文件名，附带递增序号防重名。 */
    private static String makeFileName(String url, int seq) {
        String host = "unknown";
        String path = "";
        try {
            URI u = new URI(url);
            host = u.getHost() == null ? "unknown" : u.getHost();
            path = u.getRawPath() == null ? "" : u.getRawPath();
        } catch (URISyntaxException ignored) {}
        String basename = path.isEmpty() ? "index.js" : path.substring(path.lastIndexOf('/') + 1);
        if (!basename.endsWith(".js") && !basename.endsWith(".mjs")) basename = basename + ".js";
        // 文件系统不安全字符替换
        String safeHost = host.replaceAll("[^a-zA-Z0-9._-]", "_");
        String safeName = basename.replaceAll("[^a-zA-Z0-9._-]", "_");
        // 截断超长 basename
        if (safeName.length() > 80) safeName = safeName.substring(0, 80);
        return String.format("%04d_%s_%s", seq, safeHost, safeName);
    }

    public record Entry(String url, int status, String contentType, int size,
                        String savedAs, long savedAt) {}
}
