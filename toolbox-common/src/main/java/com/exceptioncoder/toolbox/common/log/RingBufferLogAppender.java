package com.exceptioncoder.toolbox.common.log;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import ch.qos.logback.core.AppenderBase;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/**
 * 内存环形缓冲 Appender：常驻保留最近 {@link #CAPACITY} 条日志，供 {@code GET /api/system/logs}
 * 即时取用（Vibe Coding 排查：出问题一键取日志贴给 AI，免去翻文件）。
 *
 * <p>覆盖面：sidecar(node) 的 stdout/stderr 已由 SidecarProcessRegistry 透传进后端 SLF4J，
 * 故这一个缓冲同时含 Java 后端 + Claude/Codex sidecar 日志——正是排查这类问题最需要的那段。
 *
 * <p>由 {@code logback-spring.xml} 挂到 root。appender 实例由 logback 创建、非 Spring 管理，
 * 读取方拿不到实例，故用类级共享缓冲 + 静态 {@link #snapshot()} 暴露。
 */
public class RingBufferLogAppender extends AppenderBase<ILoggingEvent> {

    /** 单条日志：保留 level 便于「错误优先 + 上下文」提取；message 已内联异常栈。 */
    public record Entry(long ts, String level, String thread, String logger, String message) {}

    /** 缓冲容量（条）。本机工具量级，500 条约几百 KB，够覆盖一次操作前后的上下文。 */
    private static final int CAPACITY = 500;

    private static final Object LOCK = new Object();
    private static final ArrayDeque<Entry> BUFFER = new ArrayDeque<>(CAPACITY);

    @Override
    protected void append(ILoggingEvent e) {
        String msg = e.getFormattedMessage();
        IThrowableProxy tp = e.getThrowableProxy();
        if (tp != null) {
            msg = msg + System.lineSeparator() + ThrowableProxyUtil.asString(tp);
        }
        Entry entry = new Entry(e.getTimeStamp(), e.getLevel().toString(),
                e.getThreadName(), e.getLoggerName(), msg);
        synchronized (LOCK) {
            if (BUFFER.size() >= CAPACITY) {
                BUFFER.pollFirst();
            }
            BUFFER.addLast(entry);
        }
    }

    /** 当前缓冲快照（最旧在前、最新在后）。 */
    public static List<Entry> snapshot() {
        synchronized (LOCK) {
            return new ArrayList<>(BUFFER);
        }
    }
}
