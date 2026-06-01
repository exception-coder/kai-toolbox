package com.exceptioncoder.toolbox.claudechat.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** claude-chat 工具配置。sidecar 启动与连接参数。 */
@Data
@Component
@ConfigurationProperties(prefix = "toolbox.claude-chat")
public class ClaudeChatProperties {

    /** 是否启用本工具 */
    private boolean enabled = true;

    /** Node sidecar 工程目录（相对 jar 运行目录或绝对路径），内含已构建的 dist/server.js */
    private String sidecarDir = "sidecar/claude-agent";

    /** 启动 sidecar 的命令；默认 node dist/server.js */
    private String nodeCommand = "node";

    /** sidecar 入口脚本（相对 sidecarDir） */
    private String entryScript = "dist/server.js";

    /** sidecar 监听端口，仅绑 127.0.0.1。Java 作为 WS 客户端连接此端口 */
    private int sidecarPort = 18890;

    /** 浏览器无操作时，权限/提问请求多久未决策即按 deny（毫秒） */
    private long decisionTimeoutMs = 5 * 60 * 1000L;

    /** 每会话事件环形缓冲容量（用于断连重连回放当前一轮） */
    private int eventBufferSize = 500;

    /** 等待 sidecar 就绪的最长时间（毫秒） */
    private long sidecarStartupTimeoutMs = 15_000L;

    /** 单个附件最大字节数，默认 50MB。 */
    private long maxAttachmentBytes = 50L * 1024 * 1024;

    /** 单条消息最多附件数。 */
    private int maxAttachmentsPerMessage = 10;
}
