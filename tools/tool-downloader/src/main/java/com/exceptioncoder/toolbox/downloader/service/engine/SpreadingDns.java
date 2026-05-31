package com.exceptioncoder.toolbox.downloader.service.engine;

import okhttp3.Dns;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * CDN 节点散打 DNS：每次 lookup 把 IP 列表轮转一下，让 OkHttp 优先用不同 IP。
 *
 * <h3>核心思路</h3>
 * <ul>
 *   <li>{@link DnsResolver} 返回 N 个 IP（CDN 多个边缘节点）</li>
 *   <li>OkHttp 每次新建 socket 会调 {@link #lookup(String)} 拿 IP 列表，按顺序尝试</li>
 *   <li>本实现每次 lookup 把列表旋转 1 格，让 4 个 worker 拿到不同的 first-IP</li>
 *   <li>OkHttp 内部如果第一个 IP 失败会自动 fallback 到下一个，所以保留完整列表</li>
 * </ul>
 *
 * <h3>实际散打效果取决于</h3>
 * <ul>
 *   <li>CDN 域名是否真有多个 A 记录（单 IP 的话散打无效）</li>
 *   <li>OkHttp ConnectionPool 是否复用了已有连接（要调小 keep-alive）</li>
 *   <li>是否真的走 HTTP/1.1（H2 强制单连接，散打无效）</li>
 * </ul>
 */
public final class SpreadingDns implements Dns {

    private final DnsResolver resolver;
    private final AtomicInteger counter = new AtomicInteger();

    public SpreadingDns(DnsResolver resolver) {
        this.resolver = resolver;
    }

    @Override
    public List<InetAddress> lookup(String hostname) throws UnknownHostException {
        List<InetAddress> all = resolver.resolveAll(hostname);
        if (all.size() <= 1) {
            return all;  // 单 IP 没法散打，直接返回
        }
        int start = Math.floorMod(counter.getAndIncrement(), all.size());
        List<InetAddress> rotated = new ArrayList<>(all);
        Collections.rotate(rotated, -start);
        return rotated;
    }
}
