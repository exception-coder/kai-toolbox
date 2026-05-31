package com.exceptioncoder.toolbox.downloader.service;

import com.exceptioncoder.toolbox.downloader.config.DownloaderProperties;
import com.exceptioncoder.toolbox.downloader.domain.ProxyCandidate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * 系统代理探测器。每次任务都重新读取，避免缓存住用户启停 VPN 的状态。
 * 合并优先级（前者覆盖后者）：
 *   1) toolbox.downloader.proxy 显式配置
 *   2) HTTPS_PROXY / HTTP_PROXY 环境变量
 *   3) JVM -Dhttp.proxyHost / -Dhttps.proxyHost 系统属性
 *   4) ProxySelector.getDefault() — 在 -Djava.net.useSystemProxies=true 下读 Windows 注册表
 */
@Service
public class ProxyDetector {

    private static final Logger log = LoggerFactory.getLogger(ProxyDetector.class);
    /** ProxySelector 探针 URI，仅用于触发系统代理解析，本身不发起请求 */
    private static final URI PROBE_URI = URI.create("https://example.com/");

    private final DownloaderProperties props;

    public ProxyDetector(DownloaderProperties props) {
        this.props = props;
        // 启动期把 JDK 切到「读系统代理」模式。仅在 ProxyDetector 被加载时执行一次。
        // tool-downloader 是 starter 的可选依赖，普通启动不应改变全局副作用 → 谨慎选择属性级别。
        System.setProperty("java.net.useSystemProxies", "true");
    }

    /**
     * 返回所有命中的候选，调用方按列表顺序优先使用首项。
     */
    public List<ProxyCandidate> detect() {
        List<ProxyCandidate> candidates = new ArrayList<>(4);
        appendToolboxConfig(candidates);
        appendEnv(candidates);
        appendJvmProperty(candidates);
        appendSystemSelector(candidates);
        return candidates;
    }

    public Optional<ProxyCandidate> effective() {
        return detect().stream().findFirst();
    }

    private void appendToolboxConfig(List<ProxyCandidate> out) {
        String url = props.getProxy();
        parseUrl(url).ifPresent(p -> out.add(new ProxyCandidate(
                ProxyCandidate.Source.TOOLBOX_CONFIG, p.scheme, p.host, p.port, p.origin)));
    }

    private void appendEnv(List<ProxyCandidate> out) {
        String env = firstNonBlank(
                System.getenv("HTTPS_PROXY"),
                System.getenv("https_proxy"),
                System.getenv("HTTP_PROXY"),
                System.getenv("http_proxy"),
                System.getenv("TOOLBOX_HTTP_PROXY"));
        parseUrl(env).ifPresent(p -> out.add(new ProxyCandidate(
                ProxyCandidate.Source.ENV, p.scheme, p.host, p.port, p.origin)));
    }

    private void appendJvmProperty(List<ProxyCandidate> out) {
        String host = firstNonBlank(System.getProperty("https.proxyHost"), System.getProperty("http.proxyHost"));
        if (host == null) return;
        String portStr = firstNonBlank(System.getProperty("https.proxyPort"), System.getProperty("http.proxyPort"));
        int port = portStr == null ? 8080 : safeParseInt(portStr, 8080);
        String scheme = System.getProperty("https.proxyHost") != null ? "https" : "http";
        out.add(new ProxyCandidate(
                ProxyCandidate.Source.JVM_PROPERTY, scheme, host, port,
                "http://" + host + ":" + port));
    }

    private void appendSystemSelector(List<ProxyCandidate> out) {
        try {
            ProxySelector selector = ProxySelector.getDefault();
            if (selector == null) return;
            for (Proxy p : selector.select(PROBE_URI)) {
                if (p.type() != Proxy.Type.HTTP) continue;
                if (!(p.address() instanceof InetSocketAddress addr)) continue;
                String host = addr.getHostString();
                int port = addr.getPort();
                out.add(new ProxyCandidate(
                        ProxyCandidate.Source.WINDOWS_REGISTRY, "http", host, port,
                        "http://" + host + ":" + port));
            }
        } catch (Exception e) {
            log.debug("ProxySelector lookup failed: {}", e.getMessage());
        }
    }

    private static Optional<ParsedUrl> parseUrl(String raw) {
        if (raw == null || raw.isBlank()) return Optional.empty();
        String s = raw.trim();
        if (!s.contains("://")) s = "http://" + s;
        try {
            URI u = URI.create(s);
            if (u.getHost() == null || u.getPort() <= 0) return Optional.empty();
            String scheme = u.getScheme() == null ? "http" : u.getScheme();
            return Optional.of(new ParsedUrl(scheme, u.getHost(), u.getPort(),
                    scheme + "://" + u.getHost() + ":" + u.getPort()));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private static String firstNonBlank(String... candidates) {
        for (String c : candidates) {
            if (c != null && !c.isBlank()) return c;
        }
        return null;
    }

    private static int safeParseInt(String s, int fallback) {
        try { return Integer.parseInt(s.trim()); } catch (Exception e) { return fallback; }
    }

    private record ParsedUrl(String scheme, String host, int port, String origin) {}
}
