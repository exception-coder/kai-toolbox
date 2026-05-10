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
     * <ul>
     *   <li>{@code @amazon.com} —— 域名后缀匹配（必须 @ 开头）</li>
     *   <li>{@code abc@example.com} —— 完整地址精确匹配</li>
     *   <li>{@code support} —— 子串包含匹配（不含 @）</li>
     * </ul>
     */
    private List<String> senderWhitelist = new ArrayList<>();

    /**
     * 收件人域白名单。空列表时接受所有 RCPT TO；
     * 配置后只接受 {@code xxx@<domain>} 形式的收件人，其他直接 550 拒绝。
     * 用于公网暴露 25 端口时屏蔽垃圾邮件灌库。
     * 例：{@code ["chivepockets.com", "exception-coder.com"]}。
     */
    private List<String> recipientDomainWhitelist = new ArrayList<>();

    /** SMTP 同时容纳的最大并发连接数。单用户场景默认 20 足够，公网暴露时收紧到此上限。 */
    private int maxConnections = 20;

    /** 单封邮件最多收件人数。正常邮件 1-3 人，50 已是宽松上限。 */
    private int maxRecipients = 50;

    /** 单封邮件最大字节数（含头+body+附件 base64）。10MB 对验证邮件场景充裕，SubEtha 上限 int(2GB)。 */
    private int maxMessageSizeBytes = 10 * 1024 * 1024;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public int getPort() { return port; }
    public void setPort(int port) { this.port = port; }

    public String getHostname() { return hostname; }
    public void setHostname(String hostname) { this.hostname = hostname; }

    public List<String> getSenderWhitelist() { return senderWhitelist; }
    public void setSenderWhitelist(List<String> senderWhitelist) { this.senderWhitelist = senderWhitelist; }

    public List<String> getRecipientDomainWhitelist() { return recipientDomainWhitelist; }
    public void setRecipientDomainWhitelist(List<String> recipientDomainWhitelist) { this.recipientDomainWhitelist = recipientDomainWhitelist; }

    public int getMaxConnections() { return maxConnections; }
    public void setMaxConnections(int maxConnections) { this.maxConnections = maxConnections; }

    public int getMaxRecipients() { return maxRecipients; }
    public void setMaxRecipients(int maxRecipients) { this.maxRecipients = maxRecipients; }

    public int getMaxMessageSizeBytes() { return maxMessageSizeBytes; }
    public void setMaxMessageSizeBytes(int maxMessageSizeBytes) { this.maxMessageSizeBytes = maxMessageSizeBytes; }
}
