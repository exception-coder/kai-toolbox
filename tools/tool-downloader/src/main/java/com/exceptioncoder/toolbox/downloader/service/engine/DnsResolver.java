package com.exceptioncoder.toolbox.downloader.service.engine;

import com.exceptioncoder.toolbox.downloader.config.DownloaderProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 共享的 DNS 解析器。
 * 主要职责：对 CDN 域名一次性查全部 A 记录，缓存 TTL 内复用，避免每次建连都打 DNS。
 *
 * <h3>为什么不直接用 OkHttp 的内置 DNS</h3>
 * OkHttp 默认 Dns 实现也会缓存，但是缓存是「单个 client 实例级」的。我们的任务级 engine
 * 短生命周期，每次新建 engine 都会重新 DNS。集中到这里缓存，跨任务共享。
 *
 * <h3>关键点</h3>
 * 一次解析返回多个 IP（CDN 边缘节点）；调用方按需轮转使用。
 */
@Component
public class DnsResolver {

    private static final Logger log = LoggerFactory.getLogger(DnsResolver.class);

    private final DownloaderProperties props;
    private final ConcurrentMap<String, CacheEntry> cache = new ConcurrentHashMap<>();

    public DnsResolver(DownloaderProperties props) {
        this.props = props;
    }

    /**
     * 解析域名得到全部 IP（按 props.dnsSpread.ipv4Only 过滤）。
     * 缓存命中时直接返回；未命中走 {@link InetAddress#getAllByName} 同步解析。
     *
     * @throws UnknownHostException 解析失败
     */
    public List<InetAddress> resolveAll(String hostname) throws UnknownHostException {
        long ttl = props.getDnsSpread().getCacheTtlMs();
        CacheEntry e = cache.get(hostname);
        long now = System.currentTimeMillis();
        if (e != null && now - e.resolvedAt < ttl) {
            return e.addresses;
        }
        InetAddress[] all = InetAddress.getAllByName(hostname);
        List<InetAddress> filtered = Arrays.stream(all)
                .filter(a -> !props.getDnsSpread().isIpv4Only() || a instanceof Inet4Address)
                .toList();
        if (filtered.isEmpty()) {
            // ipv4Only=true 但只有 IPv6 时，降级用全集，不然连不上
            filtered = Arrays.asList(all);
        }
        List<InetAddress> immutable = Collections.unmodifiableList(filtered);
        cache.put(hostname, new CacheEntry(immutable, now));
        log.info("[DNS] {} → 解析到 {} 个 IP: {}", hostname, immutable.size(),
                immutable.stream().map(InetAddress::getHostAddress).toList());
        return immutable;
    }

    private record CacheEntry(List<InetAddress> addresses, long resolvedAt) {}
}
