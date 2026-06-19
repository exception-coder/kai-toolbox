package com.exceptioncoder.toolbox.wechat.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 绑定 {@code toolbox.wechat.*}。由顶层 {@code @ConfigurationPropertiesScan} 自动注册。
 */
@ConfigurationProperties(prefix = "toolbox.wechat")
public class WechatProperties {

    /** Python wxauto sidecar 地址（python-services/wechat，需在装了微信的 PC 上手动 start.bat 起）。 */
    private String sidecarUrl = "http://127.0.0.1:9700";

    /** 调用 sidecar 的超时秒数。 */
    private int timeoutSeconds = 30;

    /** 后台轮询 sidecar /listen/poll 的间隔毫秒。监听到的新消息据此落库 + 推前端。 */
    private long pollIntervalMs = 2000;

    public String getSidecarUrl() { return sidecarUrl; }
    public void setSidecarUrl(String sidecarUrl) {
        this.sidecarUrl = sidecarUrl == null ? "" : sidecarUrl.trim();
    }

    public int getTimeoutSeconds() { return timeoutSeconds; }
    public void setTimeoutSeconds(int timeoutSeconds) {
        this.timeoutSeconds = Math.max(1, timeoutSeconds);
    }

    public long getPollIntervalMs() { return pollIntervalMs; }
    public void setPollIntervalMs(long pollIntervalMs) {
        this.pollIntervalMs = Math.max(500, pollIntervalMs);
    }
}
