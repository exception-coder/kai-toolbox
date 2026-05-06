package com.exceptioncoder.toolbox.mail.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/** SMTP 服务器配置，前缀 {@code toolbox.mail}。 */
@ConfigurationProperties("toolbox.mail")
public class MailProperties {

    /** 是否启动内嵌 SMTP 服务器，默认 false，需要显式开启。 */
    private boolean enabled = false;

    /** SMTP 监听端口，Linux 25 端口需要 root；建议生产用 1025 并配 iptables 转发。 */
    private int port = 1025;

    /** SMTP EHLO 响应使用的 hostname。 */
    private String hostname = "localhost";

    /**
     * 发件人地址白名单。空列表时接受所有来源；
     * 支持域名后缀匹配（如 {@code @amazon.com}）和精确地址匹配。
     */
    private List<String> senderWhitelist = new ArrayList<>();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public int getPort() { return port; }
    public void setPort(int port) { this.port = port; }

    public String getHostname() { return hostname; }
    public void setHostname(String hostname) { this.hostname = hostname; }

    public List<String> getSenderWhitelist() { return senderWhitelist; }
    public void setSenderWhitelist(List<String> senderWhitelist) { this.senderWhitelist = senderWhitelist; }
}
