package com.exceptioncoder.toolbox.mediaparser.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.net.Proxy;
import java.net.ProxySelector;
import java.net.URI;
import java.util.List;

/**
 * 启动后打印每个 HTTP 客户端实际生效的代理配置，
 * 用来快速判断「连不上是因为没走代理 / 不该走代理却走了 / 站点本身挂了」。
 */
@Slf4j
@Component
public class HttpProxyDiagnosticsReporter {

    /** 列举几个本模块会访问的代表站点，看它们各自被路由到哪里。 */
    private static final List<String> PROBE_URLS = List.of(
            "https://fsaver.com",
            "https://saveinst.app",
            "https://www.youtube.com",
            "https://www.tiktok.com"
    );

    private final ProxyConfig proxyConfig;

    public HttpProxyDiagnosticsReporter(ProxyConfig proxyConfig) {
        this.proxyConfig = proxyConfig;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void report() {
        log.info("================ Media Parser HTTP 代理诊断 ================");

        log.info("[应用级代理 - toolbox.media-parser.proxy]");
        if (proxyConfig.isEnabled()) {
            log.info("  ✓ 已启用: {} (host={}, port={})",
                    proxyConfig.getRawUrl(), proxyConfig.getHost(), proxyConfig.getPort());
        } else {
            log.info("  ✗ 未配置 → Jsoup / HttpClient / yt-dlp 均走直连");
        }

        log.info("[JVM 系统属性] (仅当应用级代理未启用时被 Jsoup 使用)");
        logProp("http.proxyHost");
        logProp("http.proxyPort");
        logProp("https.proxyHost");
        logProp("https.proxyPort");
        logProp("http.nonProxyHosts");
        logProp("socksProxyHost");
        logProp("socksProxyPort");

        log.info("[环境变量] (仅当应用级代理未启用时被 yt-dlp 子进程使用)");
        logEnv("HTTP_PROXY");
        logEnv("HTTPS_PROXY");
        logEnv("NO_PROXY");
        logEnv("http_proxy");
        logEnv("https_proxy");
        logEnv("no_proxy");

        log.info("[ProxySelector.getDefault() 对各站点的解析结果]");
        ProxySelector selector = ProxySelector.getDefault();
        for (String url : PROBE_URLS) {
            try {
                List<Proxy> proxies = selector.select(URI.create(url));
                log.info("  {} → {}", url, proxies);
            } catch (Exception e) {
                log.warn("  {} → 解析失败: {}", url, e.getMessage());
            }
        }

        log.info("[各 HTTP 客户端的代理策略]");
        if (proxyConfig.isEnabled()) {
            String url = proxyConfig.getRawUrl();
            log.info("  Jsoup (SnapCdnParser)        → ✓ 显式 {}", url);
            log.info("  java.net.http.HttpClient     → ✓ 显式 {}", url);
            log.info("  yt-dlp 子进程                 → ✓ --proxy {}", url);
        } else {
            log.info("  Jsoup (SnapCdnParser)        → 未显式配置，走 ProxySelector.getDefault()");
            log.info("  java.net.http.HttpClient     → 未显式配置 .proxy()，直连");
            log.info("  yt-dlp 子进程                 → 未传 --proxy，仅看 HTTP_PROXY/HTTPS_PROXY 环境变量");
        }
        log.info("============================================================");
    }

    private void logProp(String key) {
        String val = System.getProperty(key);
        log.info("  -D{} = {}", key, val == null ? "(unset)" : val);
    }

    private void logEnv(String key) {
        String val = System.getenv(key);
        log.info("  ${} = {}", key, val == null ? "(unset)" : val);
    }
}
