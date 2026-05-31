package com.exceptioncoder.toolbox.downloader.service.engine;

import com.exceptioncoder.toolbox.downloader.config.DownloaderProperties;
import com.exceptioncoder.toolbox.downloader.domain.ProxyCandidate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 基于 JDK 21 java.net.http.HttpClient 的实现。
 *
 * <h3>本实现要解决的核心问题</h3>
 * JDK HttpClient 的 {@link HttpRequest.Builder#timeout(Duration)} 只覆盖
 * 「请求发出 → 响应头到达」这一段。响应头到达后进入 body 流式读取阶段，
 * 任何 timeout 都失效，{@code InputStream.read()} 会无限阻塞。
 *
 * 对应在 {@link #openRange(URI, long, long)} 用一个守门狗
 * {@link ScheduledExecutorService}：每秒检查 lastReadAt，超时主动 close stream，
 * 让阻塞的 read 抛 IOException，从而让上层重试机制有机会工作。
 *
 * 详见设计文档 §10.1（智能加速下载器-current.md）。
 */
public final class JdkHttpEngine implements HttpEngine {

    private static final Logger log = LoggerFactory.getLogger(JdkHttpEngine.class);

    private final DownloaderProperties props;
    private final HttpClient client;
    private final ScheduledExecutorService watchdog;
    /** 协议版本只在第一次拉取时记录一次，避免日志风暴 */
    private final AtomicBoolean protocolLogged = new AtomicBoolean(false);

    public JdkHttpEngine(DownloaderProperties props, Optional<ProxyCandidate> proxy) {
        this.props = props;
        HttpClient.Builder b = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_2)
                .connectTimeout(Duration.ofMillis(props.getConnectTimeoutMs()))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .executor(Executors.newVirtualThreadPerTaskExecutor());
        if (proxy.isPresent()) {
            ProxyCandidate p = proxy.get();
            b.proxy(ProxySelector.of(new InetSocketAddress(p.host(), p.port())));
        } else {
            b.proxy(HttpClient.Builder.NO_PROXY);
        }
        this.client = b.build();
        this.watchdog = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "jdk-engine-read-idle-watchdog");
            t.setDaemon(true);
            return t;
        });
    }

    @Override
    public String name() { return "JDK"; }

    @Override
    public ProbeResult probe(URI url, long bytes, Duration totalTimeout) throws IOException {
        long start = System.nanoTime();
        HttpRequest req = HttpRequest.newBuilder(url)
                .GET()
                .header("Range", "bytes=0-" + (bytes - 1))
                .timeout(totalTimeout)
                .build();
        try {
            HttpResponse<byte[]> resp = client.send(req, HttpResponse.BodyHandlers.ofByteArray());
            long ttfbMs = (System.nanoTime() - start) / 1_000_000;
            return new ProbeResult(resp.statusCode(), toEngineHeaders(resp), resp.body(), ttfbMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("probe interrupted", e);
        }
    }

    @Override
    public RangeStream openRange(URI url, long from, long to) throws IOException {
        HttpRequest.Builder rb = HttpRequest.newBuilder(url).GET()
                .header("Range", "bytes=" + from + "-" + to);
        if (props.getRequestTimeoutMs() > 0) {
            rb.timeout(Duration.ofMillis(props.getRequestTimeoutMs()));
        }
        HttpResponse<java.io.InputStream> resp;
        try {
            resp = client.send(rb.build(), HttpResponse.BodyHandlers.ofInputStream());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("send interrupted", e);
        }
        if (protocolLogged.compareAndSet(false, true)) {
            log.info("[JDK] {} → 协商协议 {}", url.getHost(), resp.version());
        }
        EngineHeaders headers = toEngineHeaders(resp);
        java.io.InputStream raw = resp.body();

        // 守门狗：每秒检查 idle 时长，超时主动 close stream
        AtomicLong lastReadAt = new AtomicLong(System.nanoTime());
        long idleNanos = TimeUnit.MILLISECONDS.toNanos(props.getReadIdleTimeoutMs());
        ScheduledFuture<?> guard = watchdog.scheduleAtFixedRate(() -> {
            if (System.nanoTime() - lastReadAt.get() > idleNanos) {
                try { raw.close(); } catch (IOException ignored) { /* best-effort */ }
            }
        }, 1, 1, TimeUnit.SECONDS);

        // 包装 stream，每次 read 后更新 lastReadAt；close 时取消守门狗
        java.io.InputStream wrapped = new java.io.InputStream() {
            @Override public int read() throws IOException {
                int n = raw.read();
                if (n >= 0) lastReadAt.set(System.nanoTime());
                return n;
            }
            @Override public int read(byte[] b, int off, int len) throws IOException {
                int n = raw.read(b, off, len);
                if (n >= 0) lastReadAt.set(System.nanoTime());
                return n;
            }
            @Override public void close() throws IOException { raw.close(); }
        };

        return new RangeStream(resp.statusCode(), headers, wrapped, () -> guard.cancel(false));
    }

    @Override
    public void close() {
        try { client.close(); } catch (Exception ignored) { /* best-effort */ }
        watchdog.shutdownNow();
    }

    // ---------- helpers ----------

    private static EngineHeaders toEngineHeaders(HttpResponse<?> resp) {
        Map<String, String> map = new HashMap<>();
        resp.headers().map().forEach((k, vs) -> {
            if (vs != null && !vs.isEmpty()) map.put(k, vs.get(0));
        });
        return new EngineHeaders(map);
    }
}
