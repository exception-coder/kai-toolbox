package com.exceptioncoder.toolbox.downloader.domain;

/**
 * 底层 HTTP 客户端实现选择。
 * - JDK：java.net.http.HttpClient + 手写守门狗（治 body 阶段无超时）
 * - OKHTTP：square OkHttp，原生 readTimeout 覆盖整个读流程
 * 并存用途：对比两种实现在 stalled / 限流 / TLS 中断等场景下的差异。
 */
public enum HttpEngineType {
    JDK,
    OKHTTP;

    public static HttpEngineType parseOrDefault(String raw) {
        if (raw == null || raw.isBlank()) return JDK;
        try { return valueOf(raw.trim().toUpperCase()); }
        catch (IllegalArgumentException e) { return JDK; }
    }
}
