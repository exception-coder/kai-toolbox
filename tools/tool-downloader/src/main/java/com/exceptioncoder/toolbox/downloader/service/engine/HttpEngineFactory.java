package com.exceptioncoder.toolbox.downloader.service.engine;

import com.exceptioncoder.toolbox.downloader.config.DownloaderProperties;
import com.exceptioncoder.toolbox.downloader.domain.HttpEngineType;
import com.exceptioncoder.toolbox.downloader.domain.ProxyCandidate;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * 按 {@link HttpEngineType} 创建对应实现。
 * 任务级选择：DownloaderTaskService.kickoff 根据 task.httpEngine 创建 primary/backup 两个 engine。
 *
 * <h3>CDN 节点散打</h3>
 * 当 props.dnsSpread.enabled=true 且引擎类型为 OKHTTP 时，注入 {@link SpreadingDns}
 * 让 OkHttp 强制 HTTP/1.1 + 禁用连接池复用，每个分片连不同 CDN 边缘节点。
 * JDK 引擎因为没有 Dns 抽象，本期不支持散打（仍按原模式跑）。
 */
@Component
public class HttpEngineFactory {

    private final DownloaderProperties props;
    private final DnsResolver dnsResolver;

    public HttpEngineFactory(DownloaderProperties props, DnsResolver dnsResolver) {
        this.props = props;
        this.dnsResolver = dnsResolver;
    }

    public HttpEngine create(HttpEngineType type, Optional<ProxyCandidate> proxy) {
        return switch (type) {
            case JDK -> new JdkHttpEngine(props, proxy);
            case OKHTTP -> {
                boolean spread = props.getDnsSpread().isEnabled() && proxy.isEmpty();
                // 注意：走代理时散打无意义（所有流量都走代理出口 IP），自动退化为普通模式
                if (spread) {
                    yield new OkHttpEngine(props, proxy, new SpreadingDns(dnsResolver));
                } else {
                    yield new OkHttpEngine(props, proxy);
                }
            }
        };
    }
}
