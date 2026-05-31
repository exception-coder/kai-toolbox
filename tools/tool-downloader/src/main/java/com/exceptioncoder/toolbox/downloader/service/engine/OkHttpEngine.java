package com.exceptioncoder.toolbox.downloader.service.engine;

import com.exceptioncoder.toolbox.downloader.config.DownloaderProperties;
import com.exceptioncoder.toolbox.downloader.domain.ProxyCandidate;
import okhttp3.ConnectionPool;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.URI;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 基于 Square OkHttp 4.x 的实现。
 *
 * <h3>相对 JDK HttpClient 的优势（对比演示重点）</h3>
 * <ul>
 *   <li><b>readTimeout 原生支持</b>：通过 {@link OkHttpClient.Builder#readTimeout(long, TimeUnit)}
 *       直接配置「相邻两次 socket read 之间的最大间隔」。OkHttp 内部用 NIO + 自己的 timeout 调度器，
 *       超时自动抛 {@code SocketTimeoutException}，<b>不需要手写守门狗</b>。</li>
 *   <li><b>连接池可控</b>：{@link ConnectionPool} 暴露 maxIdleConnections、keepAliveDuration</li>
 *   <li><b>HTTP/2 默认开启</b>：与 JDK 一致</li>
 *   <li>未来如需自定义 DNS（CDN 节点散打）/ 拦截器 / TLS 指纹混淆，OkHttp 都暴露了扩展点</li>
 * </ul>
 *
 * 代价：引入 ~2 MB 第三方依赖（OkHttp + kotlin-stdlib）。
 */
public final class OkHttpEngine implements HttpEngine {

    private static final Logger log = LoggerFactory.getLogger(OkHttpEngine.class);

    private final OkHttpClient client;
    private final AtomicBoolean protocolLogged = new AtomicBoolean(false);
    private final boolean spreadMode;

    public OkHttpEngine(DownloaderProperties props, Optional<ProxyCandidate> proxy) {
        this(props, proxy, null);
    }

    /**
     * @param spreadingDns 非 null 时启用 CDN 节点散打：强制 HTTP/1.1 + 禁用 ConnectionPool 让每片新建到不同 IP
     */
    public OkHttpEngine(DownloaderProperties props, Optional<ProxyCandidate> proxy, okhttp3.Dns spreadingDns) {
        this.spreadMode = spreadingDns != null;
        OkHttpClient.Builder b = new OkHttpClient.Builder()
                .connectTimeout(props.getConnectTimeoutMs(), TimeUnit.MILLISECONDS)
                // 关键差异：readTimeout 直接覆盖 body 读取阶段，stalled 自动恢复
                .readTimeout(props.getReadIdleTimeoutMs(), TimeUnit.MILLISECONDS)
                .writeTimeout(props.getConnectTimeoutMs(), TimeUnit.MILLISECONDS)
                // callTimeout 0 = 不限制单次请求总耗时，与 JDK 引擎一致
                .callTimeout(props.getRequestTimeoutMs(), TimeUnit.MILLISECONDS)
                // 散打模式必须强制 HTTP/1.1：H2 单连接设计与多 socket 散打互斥
                .protocols(spreadMode
                        ? List.of(Protocol.HTTP_1_1)
                        : List.of(Protocol.HTTP_2, Protocol.HTTP_1_1))
                .followRedirects(true)
                .retryOnConnectionFailure(false);  // 关闭 OkHttp 自己的重试，统一由我们的编排层管
        if (spreadMode) {
            // 散打：自定义 DNS 轮转 IP；禁用 ConnectionPool idle 复用，强制每片新建 socket 到不同 IP
            // 代价：每片多一次 TCP+TLS 握手开销（跨境 RTT 200ms+ 时约 1s/握手），但能拿满多节点累加带宽
            b.dns(spreadingDns)
             .connectionPool(new ConnectionPool(0, 1, TimeUnit.SECONDS));
        }
        if (proxy.isPresent()) {
            ProxyCandidate p = proxy.get();
            b.proxy(new Proxy(Proxy.Type.HTTP, new InetSocketAddress(p.host(), p.port())));
        } else {
            b.proxy(Proxy.NO_PROXY);
        }
        this.client = b.build();
    }

    @Override
    public String name() { return spreadMode ? "OkHttp[DNS散打]" : "OkHttp"; }

    @Override
    public ProbeResult probe(URI url, long bytes, Duration totalTimeout) throws IOException {
        Request req = new Request.Builder()
                .url(url.toString())
                .get()
                .header("Range", "bytes=0-" + (bytes - 1))
                .build();
        // 用一个临时的 client 调整 callTimeout，避免影响主 client 的设置
        OkHttpClient probeClient = client.newBuilder()
                .callTimeout(totalTimeout.toMillis(), TimeUnit.MILLISECONDS)
                .build();
        long start = System.nanoTime();
        try (Response resp = probeClient.newCall(req).execute()) {
            long ttfbMs = (System.nanoTime() - start) / 1_000_000;
            ResponseBody body = resp.body();
            byte[] bytesArr = body == null ? new byte[0] : body.bytes();
            return new ProbeResult(resp.code(), toEngineHeaders(resp), bytesArr, ttfbMs);
        }
    }

    @Override
    public RangeStream openRange(URI url, long from, long to) throws IOException {
        Request req = new Request.Builder()
                .url(url.toString())
                .get()
                .header("Range", "bytes=" + from + "-" + to)
                .build();
        Response resp = client.newCall(req).execute();
        if (protocolLogged.compareAndSet(false, true)) {
            log.info("[OkHttp] {} → 协商协议 {}", url.getHost(), resp.protocol());
        }
        ResponseBody body = resp.body();
        if (body == null) {
            resp.close();
            throw new IOException("OkHttp response body is null for Range " + from + "-" + to);
        }
        InputStream stream = body.byteStream();
        // OkHttp 自带 readTimeout，stream.read() 超时会抛 SocketTimeoutException → 上层走重试
        return new RangeStream(resp.code(), toEngineHeaders(resp), stream, resp::close);
    }

    @Override
    public void close() {
        // OkHttp 没有强制 close 接口；走优雅释放：清空连接池 + 取消所有进行中的 call
        client.dispatcher().cancelAll();
        client.connectionPool().evictAll();
    }

    // ---------- helpers ----------

    private static EngineHeaders toEngineHeaders(Response resp) {
        Map<String, String> map = new HashMap<>();
        for (String name : resp.headers().names()) {
            String v = resp.header(name);
            if (v != null) map.put(name, v);
        }
        return new EngineHeaders(map);
    }
}
