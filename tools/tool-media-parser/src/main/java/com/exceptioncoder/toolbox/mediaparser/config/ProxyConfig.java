package com.exceptioncoder.toolbox.mediaparser.config;

import org.springframework.stereotype.Component;

import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.URI;

/**
 * 解析 toolbox.media-parser.proxy 一次，把结果按各 HTTP 客户端需要的形式提供出去。
 * 不配置则全部走直连。
 */
@Component
public class ProxyConfig {
    private final String rawUrl;
    private final String host;
    private final int port;
    private final Proxy javaProxy;
    private final ProxySelector selector;

    public ProxyConfig(MediaParserProperties props) {
        String url = props.getProxy();
        if (url == null || url.isBlank()) {
            this.rawUrl = null;
            this.host = null;
            this.port = -1;
            this.javaProxy = Proxy.NO_PROXY;
            this.selector = null;
            return;
        }

        URI uri = URI.create(url.trim());
        if (uri.getHost() == null || uri.getPort() < 0) {
            throw new IllegalArgumentException(
                    "toolbox.media-parser.proxy 解析失败，应为 http://host:port 格式: " + url);
        }
        this.rawUrl = url.trim();
        this.host = uri.getHost();
        this.port = uri.getPort();
        InetSocketAddress addr = new InetSocketAddress(host, port);
        this.javaProxy = new Proxy(Proxy.Type.HTTP, addr);
        this.selector = ProxySelector.of(addr);
    }

    public boolean isEnabled() {
        return rawUrl != null;
    }

    /** 原始字符串，例如 http://127.0.0.1:7890；用于 yt-dlp --proxy。 */
    public String getRawUrl() {
        return rawUrl;
    }

    public String getHost() {
        return host;
    }

    public int getPort() {
        return port;
    }

    /** 给 java.net.http.HttpClient 用：.proxy(getSelector())。 */
    public ProxySelector getSelector() {
        return selector;
    }

    /** 给 java.net.URLConnection / Jsoup 用。 */
    public Proxy getJavaProxy() {
        return javaProxy;
    }
}
