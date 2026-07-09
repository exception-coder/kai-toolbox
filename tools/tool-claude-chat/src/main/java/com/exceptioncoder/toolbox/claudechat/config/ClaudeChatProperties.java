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

    /** 每会话事件环形缓冲容量（用于断连重连回放当前一轮）。
     *  注意 assistantDelta 按流式分片逐条入缓冲，一轮长回复 + 工具调用很容易上千条，
     *  容量过小会在断连较久时把旧事件淘汰出窗导致回放空洞，故给足。 */
    private int eventBufferSize = 2000;

    /** 等待 sidecar 就绪的最长时间（毫秒） */
    private long sidecarStartupTimeoutMs = 15_000L;

    /**
     * WebSocket 单条文本/二进制消息最大字节数（两跳都用：浏览器↔后端、后端↔sidecar）。默认 8MB。
     * Spring/Tomcat 默认仅 8192，一条大消息（如 Write 大文件的 permissionRequest 带整份内容、大 toolResult）
     * 会超限被以 1009 关连、确认丢失、静默失败。给足以覆盖常见源码文件；极端超大仍会失败(需 agent 分块写)。
     */
    private int wsMaxMessageBytes = 8 * 1024 * 1024;

    /** 单个附件最大字节数，默认 50MB。 */
    private long maxAttachmentBytes = 50L * 1024 * 1024;

    /** 单条消息最多附件数。 */
    private int maxAttachmentsPerMessage = 10;

    /** 一次性 Agent 任务（高质量简历优化）最长等待时间（毫秒）。 */
    private long agentOneShotTimeoutMs = 120_000L;
}
