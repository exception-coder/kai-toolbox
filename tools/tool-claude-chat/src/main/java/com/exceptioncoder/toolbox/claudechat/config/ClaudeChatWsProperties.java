package com.exceptioncoder.toolbox.claudechat.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.ConfigDesc;
import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Vibe Coding 的 WebSocket 传输配置，前缀 {@code toolbox.claude-chat.ws}。
 *
 * <p>单列一个块纳入配置中心（可在线编辑、写 SQLite、重启保留）。但 WS 缓冲在启动时随容器建立，
 * 属「改后需重启后端才生效」——放这里是为可视化查看/编辑与持久化，非热生效，说明里已标注。</p>
 */
@Component
@ConfigurationProperties(prefix = "toolbox.claude-chat.ws")
@Refreshable(name = "Vibe Coding · WS 传输", group = "Vibe Coding")
@Getter
@Setter
public class ClaudeChatWsProperties {

    @ConfigDesc("单条 WS 消息最大字节数（浏览器↔后端、后端↔sidecar 共用），默认 8MB。"
            + "大文件 Write 的确认请求/大工具结果超过此值会被 1009 断连、确认丢失。"
            + "⚠ 改后需重启后端生效（WS 缓冲在启动时建立，非热生效）。")
    private int maxMessageBytes = 8 * 1024 * 1024;
}
