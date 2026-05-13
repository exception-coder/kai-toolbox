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

    /** 同进程内并发活跃 PTY 上限。用户没主动断开就一直保活；这里只是兜底防御内存
     *  无限增长。超过上限新开 open 会返回 SESSION_LIMIT_EXCEEDED。 */
    private int maxSessions = 10;

    /** 单次推送字节阈值 */
    private int outputBufferBytes = 8192;

    /** 推送时间阈值（毫秒）。TUI 程序（Claude Code / vim / nano）的光标定位帧很小，
     *  阈值过大会让重绘明显卡。10ms 接近本地终端体验。 */
    private long outputFlushIntervalMs = 10L;

    /** 0 = 不超时 */
    private long sessionIdleTimeoutMs = 0L;

    /** open 等待超时（毫秒） */
    private long openTimeoutMs = 5000L;

    /** WebSocket 断开后保持 PTY 存活的时间（毫秒）。期间客户端可以用 attach
     *  重新接回。0 = 永不超时（用户没主动「断开」就一直保活），默认即 0。
     *  上限由 maxSessions 兜底，并发达到上限时 open 拒绝。 */
    private long detachIdleTimeoutMs = 0L;

    /** 输出回放缓冲大小（字节）。客户端 attach 时把最近这么多字节的 PTY 输出
     *  立刻 replay 给它，让用户看到「之前那段终端长什么样」。256KB 大致够看到
     *  Claude Code 最近一两条对话。 */
    private int backlogBytes = 256 * 1024;
}
