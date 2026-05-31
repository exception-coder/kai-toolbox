package com.exceptioncoder.toolbox.downloader.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "toolbox.downloader")
public class DownloaderProperties {

    /**
     * 默认保存目录。未设置时使用 {@code <user.home>/Downloads/kai-toolbox}。
     */
    private String defaultSavePath;

    /**
     * 单分片字节数，默认 32 MiB。
     */
    private long segmentSize = 32L * 1024 * 1024;

    /**
     * 单任务最大并发分片数。
     * 4 对国内 CDN 较稳；8+ 容易触发服务端单连接限并发导致 TLS 中断。
     */
    private int maxParallelPerTask = 4;

    /**
     * 进程级最大并发分片数。
     */
    private int maxParallelGlobal = 16;

    /**
     * 链路探测整体超时（含 TLS、TTFB、256KB 拉取）。
     */
    private int probeTimeoutMs = 8000;

    /**
     * 探测拉取字节数。默认 256 KiB。
     */
    private int probeBytes = 256 * 1024;

    /**
     * 分片重试次数（不含首次尝试）。
     * 6 次能扛过常见 CDN「20-60 秒小风暴」的拒绝；总最长重试时间约 1 分钟。
     */
    private int segmentRetryMax = 6;

    /**
     * 重试退避基准（毫秒），实际为 min(base * 2^attempt, max) ± jitter。
     */
    private long segmentRetryBackoffBaseMs = 1000;

    /**
     * 重试退避上限（毫秒）。指数退避超过此值后封顶，防止后期等几分钟。
     */
    private long segmentRetryBackoffMaxMs = 30_000;

    /**
     * SSE 进度聚合窗口。
     */
    private long sseFlushIntervalMs = 500;

    /**
     * HttpClient 建立连接超时。
     */
    private int connectTimeoutMs = 10000;

    /**
     * 单次 HTTP 请求超时。0 = 不限制（依赖读空闲超时）。
     */
    private int requestTimeoutMs = 0;

    /**
     * 读空闲超时（毫秒）。worker 在此时间内一个字节都没读到，认为连接 stalled，
     * 主动 close response body 让 read() 抛 IOException 进入重试。
     * Java 阻塞 IO 中断麻烦，这是唯一可靠的「卡死探测」机制。
     */
    private long readIdleTimeoutMs = 30_000;

    /**
     * 用户额外指定的代理 URL（如 http://127.0.0.1:7890）。
     * 留空时退回工程统一约定的 ${TOOLBOX_HTTP_PROXY:} 环境变量。
     */
    private String proxy;

    /**
     * DNS 散打：让 OkHttp 引擎把不同 socket 绑到 CDN 不同边缘节点 IP，绕过单 IP 限速。
     * 注意：散打模式会强制使用 HTTP/1.1（H2 单连接设计与散打冲突）。
     * 仅对 OkHttp 引擎生效；JDK HttpClient 因为没有 Dns 抽象，本期不支持。
     */
    private DnsSpread dnsSpread = new DnsSpread();

    @Data
    public static class DnsSpread {
        /** 是否启用散打 */
        private boolean enabled = true;
        /** DNS 解析结果缓存 TTL（毫秒）。CDN 节点 IP 变化频率不高，5 分钟够 */
        private long cacheTtlMs = 300_000;
        /** 是否仅保留 IPv4。IPv6 在国内 CDN 不稳定，默认只用 v4 */
        private boolean ipv4Only = true;
    }
}
