package com.exceptioncoder.toolbox.downloader.domain;

import java.net.InetSocketAddress;
import java.net.Proxy;

/**
 * 系统代理候选。由 ProxyDetector 从多个来源（JVM 属性 / 环境变量 / Windows 注册表 / toolbox 配置）合并产生。
 */
public record ProxyCandidate(Source source, String type, String host, int port, String originUrl) {

    public enum Source {
        JVM_PROPERTY,
        ENV,
        WINDOWS_REGISTRY,
        TOOLBOX_CONFIG
    }

    /**
     * 转换为 JDK Proxy 实例，供 HttpClient 直接使用。
     */
    public Proxy toJdkProxy() {
        return new Proxy(Proxy.Type.HTTP, new InetSocketAddress(host, port));
    }
}
