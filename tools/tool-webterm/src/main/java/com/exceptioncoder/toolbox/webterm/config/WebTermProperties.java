package com.exceptioncoder.toolbox.webterm.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "toolbox.webterm")
@Getter
@Setter
public class WebTermProperties {

    /** 总开关：false 时 /api/webterm/ws 拒绝握手 */
    private boolean enabled = true;

    /** 默认 shell：powershell | cmd */
    private String defaultShell = "powershell";

    /** 同进程内并发会话上限 */
    private int maxSessions = 8;

    /** 单次推送字节阈值 */
    private int outputBufferBytes = 8192;

    /** 推送时间阈值（毫秒）。TUI 程序（Claude Code / vim / nano）的光标定位帧很小，
     *  阈值过大会让重绘明显卡。10ms 接近本地终端体验。 */
    private long outputFlushIntervalMs = 10L;

    /** 0 = 不超时 */
    private long sessionIdleTimeoutMs = 0L;

    /** open 等待超时（毫秒） */
    private long openTimeoutMs = 5000L;
}
