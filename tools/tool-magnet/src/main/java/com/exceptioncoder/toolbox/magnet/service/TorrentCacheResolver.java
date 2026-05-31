package com.exceptioncoder.toolbox.magnet.service;

import com.exceptioncoder.toolbox.magnet.config.MagnetProperties;
import okhttp3.Call;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 提交磁力前去公共种子缓存站取 .torrent，命中则跳过 aria2 的 DHT metadata 阶段。
 *
 * <h3>策略</h3>
 * <ol>
 *   <li>从磁力链抠 infohash（v1 BTIH）。带 base32 的旧链先转 hex。</li>
 *   <li>并发请求 {@link MagnetProperties.Resolver#getMirrors()} 全部镜像。</li>
 *   <li>任一返 200 + 大小合理 + bencode 头 (字节 0x64 'd') 即接受。</li>
 *   <li>cancel 剩余请求；返回字节。</li>
 *   <li>{@code totalTimeoutMs} 之内一个都没命中 → 空 Optional，调用方 fallback。</li>
 * </ol>
 *
 * <h3>线程模型</h3>
 * 用一个固定 8 线程池跑并发 HTTP；OkHttp 自身是异步的，这里只是用 ExecutorService 拼装
 * CompletableFuture 拿首个成功者。
 */
@Component
public class TorrentCacheResolver {

    private static final Logger log = LoggerFactory.getLogger(TorrentCacheResolver.class);

    private static final Pattern XT_BTIH = Pattern.compile(
            "xt=urn:btih:([A-Za-z0-9]+)", Pattern.CASE_INSENSITIVE);
    private static final char[] HEX = "0123456789abcdef".toCharArray();

    private final MagnetProperties props;
    private final OkHttpClient http;
    private final ExecutorService pool = Executors.newFixedThreadPool(8, r -> {
        Thread t = new Thread(r, "torrent-cache-resolver");
        t.setDaemon(true);
        return t;
    });

    public TorrentCacheResolver(MagnetProperties props) {
        this.props = props;
        OkHttpClient.Builder b = new OkHttpClient.Builder()
                .connectTimeout(props.getResolver().getPerMirrorTimeoutMs(), TimeUnit.MILLISECONDS)
                .readTimeout(props.getResolver().getPerMirrorTimeoutMs(), TimeUnit.MILLISECONDS)
                .callTimeout(props.getResolver().getPerMirrorTimeoutMs(), TimeUnit.MILLISECONDS)
                // 缓存镜像普遍证书凑合，跟随重定向就行
                .followRedirects(true);
        if (props.getResolver().isUseGlobalProxy()
                && props.getProxy() != null && !props.getProxy().isBlank()) {
            Proxy proxy = parseProxy(props.getProxy().trim());
            if (proxy != null) b.proxy(proxy);
        }
        this.http = b.build();
    }

    /**
     * 不是磁力链直接返空；不启用直接返空；命中返字节。
     */
    public Optional<byte[]> resolve(String magnetUri) {
        var r = props.getResolver();
        if (!r.isEnabled()) return Optional.empty();
        if (magnetUri == null || !magnetUri.toLowerCase(Locale.ROOT).startsWith("magnet:")) {
            return Optional.empty();
        }
        String hashHex = extractInfoHashHex(magnetUri);
        if (hashHex == null) return Optional.empty();

        List<String> urls = new ArrayList<>();
        for (String tpl : r.getMirrors()) {
            String url = tpl
                    .replace("{HASH}", hashHex.toLowerCase(Locale.ROOT))
                    .replace("{HASH_UPPER}", hashHex.toUpperCase(Locale.ROOT));
            urls.add(url);
        }
        if (urls.isEmpty()) return Optional.empty();

        AtomicReference<byte[]> winner = new AtomicReference<>();
        List<Call> inFlight = new ArrayList<>();
        List<CompletableFuture<Void>> futures = new ArrayList<>();

        for (String url : urls) {
            Request req = new Request.Builder()
                    .url(url)
                    .header("User-Agent", "kai-toolbox/0.1 torrent-cache-resolver")
                    .header("Accept", "application/x-bittorrent,application/octet-stream,*/*")
                    .get()
                    .build();
            Call call = http.newCall(req);
            inFlight.add(call);
            futures.add(CompletableFuture.runAsync(() -> {
                try (Response resp = call.execute();
                     ResponseBody body = resp.body()) {
                    if (!resp.isSuccessful() || body == null) return;
                    long len = body.contentLength();
                    if (len > r.getMaxBytes()) return;
                    byte[] bytes = body.bytes();
                    if (bytes.length == 0 || bytes.length > r.getMaxBytes()) return;
                    if (!looksLikeTorrent(bytes)) return;
                    if (winner.compareAndSet(null, bytes)) {
                        log.info("torrent cache HIT @ {} ({} bytes)", url, bytes.length);
                        // 取消同批其它请求，提早释放连接
                        for (Call c : inFlight) {
                            if (c != call) c.cancel();
                        }
                    }
                } catch (IOException e) {
                    // 镜像挂了/超时/被墙都属于预期
                    log.debug("torrent cache miss @ {}: {}", url, e.getMessage());
                } catch (Exception e) {
                    log.debug("torrent cache unexpected @ {}: {}", url, e.toString());
                }
            }, pool));
        }

        CompletableFuture<Void> all = CompletableFuture.allOf(
                futures.toArray(new CompletableFuture[0]));
        try {
            all.get(r.getTotalTimeoutMs(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException te) {
            for (Call c : inFlight) c.cancel();
        } catch (Exception e) {
            for (Call c : inFlight) c.cancel();
        }
        byte[] hit = winner.get();
        if (hit == null) {
            log.info("torrent cache MISS infoHash={} (tried {} mirrors)", hashHex, urls.size());
            return Optional.empty();
        }
        return Optional.of(hit);
    }

    // ---------- helpers ----------

    /** 从 magnet 链取 BTIH（v1），返 40 字符 hex。base32 (32 字符) 自动转 hex。 */
    static String extractInfoHashHex(String magnetUri) {
        Matcher m = XT_BTIH.matcher(magnetUri);
        if (!m.find()) return null;
        String raw = m.group(1);
        if (raw.length() == 40) return raw;          // 已是 hex
        if (raw.length() == 32) return base32ToHex(raw);  // base32
        return null;
    }

    private static String base32ToHex(String b32) {
        // RFC 4648 base32, 不含 padding
        String s = b32.toUpperCase(Locale.ROOT);
        int byteLen = s.length() * 5 / 8;
        byte[] out = new byte[byteLen];
        int buffer = 0, bits = 0, idx = 0;
        for (int i = 0; i < s.length(); i++) {
            int v = base32Val(s.charAt(i));
            if (v < 0) return null;
            buffer = (buffer << 5) | v;
            bits += 5;
            if (bits >= 8) {
                bits -= 8;
                out[idx++] = (byte) ((buffer >> bits) & 0xff);
            }
        }
        StringBuilder sb = new StringBuilder(out.length * 2);
        for (byte b : out) {
            sb.append(HEX[(b >> 4) & 0xf]).append(HEX[b & 0xf]);
        }
        return sb.toString();
    }

    private static int base32Val(char c) {
        if (c >= 'A' && c <= 'Z') return c - 'A';
        if (c >= '2' && c <= '7') return c - '2' + 26;
        return -1;
    }

    /** bencode dict 永远以 'd' 起头；做个轻量识别，挡住返回 HTML 错误页的镜像。 */
    private static boolean looksLikeTorrent(byte[] bytes) {
        if (bytes.length < 50) return false;
        if (bytes[0] != 'd') return false;
        // 简单挡 HTML/JSON
        String head = new String(bytes, 0, Math.min(16, bytes.length));
        return !head.startsWith("<") && !head.startsWith("{");
    }

    private static Proxy parseProxy(String url) {
        try {
            URI u = new URI(url);
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            Proxy.Type type = switch (scheme) {
                case "socks", "socks5", "socks5h" -> Proxy.Type.SOCKS;
                case "http", "https" -> Proxy.Type.HTTP;
                default -> null;
            };
            if (type == null || u.getHost() == null) return null;
            int port = u.getPort();
            if (port <= 0) port = type == Proxy.Type.SOCKS ? 1080 : 8080;
            return new Proxy(type, new InetSocketAddress(u.getHost(), port));
        } catch (URISyntaxException e) {
            return null;
        }
    }
}
