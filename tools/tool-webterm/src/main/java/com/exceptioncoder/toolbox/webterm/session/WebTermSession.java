package com.exceptioncoder.toolbox.webterm.session;

import com.exceptioncoder.toolbox.webterm.api.dto.ServerMessage;
import com.exceptioncoder.toolbox.webterm.config.WebTermProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pty4j.PtyProcess;
import com.pty4j.WinSize;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

@Slf4j
public class WebTermSession {

    @Getter private final String sessionId = UUID.randomUUID().toString();
    @Getter private final String shell;
    @Getter private final String cwd;
    @Getter private final long startedAt = System.currentTimeMillis();
    private final PtyProcess process;
    private final WebTermProperties props;
    private final ObjectMapper mapper;
    private final ScheduledExecutorService scheduler;
    private final Runnable onPermanentClose;

    // ws 现在是可切换的 —— 客户端断开后置 null，新客户端 attach 后切到新 ws
    private final AtomicReference<WebSocketSession> wsRef = new AtomicReference<>();
    private final AtomicBoolean closed = new AtomicBoolean(false);
    private final Object stdinLock = new Object();
    private final Object wsSendLock = new Object();

    private volatile int cols = 80;
    private volatile int rows = 24;
    private volatile boolean exited = false;
    private volatile int exitCode = -1;
    private volatile ScheduledFuture<?> detachIdleTask;

    private final OutputBacklog backlog;
    private Thread stdoutThread;

    public WebTermSession(WebSocketSession ws,
                          PtyProcess process,
                          String shell,
                          String cwd,
                          int cols,
                          int rows,
                          WebTermProperties props,
                          ObjectMapper mapper,
                          ScheduledExecutorService scheduler,
                          Runnable onPermanentClose) {
        this.wsRef.set(ws);
        this.process = process;
        this.shell = shell;
        this.cwd = cwd;
        this.cols = cols;
        this.rows = rows;
        this.props = props;
        this.mapper = mapper;
        this.scheduler = scheduler;
        this.onPermanentClose = onPermanentClose;
        this.backlog = new OutputBacklog(props.getBacklogBytes());
    }

    public WebSocketSession ws() {
        return wsRef.get();
    }

    public boolean isAttached() {
        WebSocketSession ws = wsRef.get();
        return ws != null && ws.isOpen();
    }

    public boolean isExited() {
        return exited;
    }

    public long pid() {
        try {
            return process.pid();
        } catch (UnsupportedOperationException e) {
            return -1;
        }
    }

    public void startOutputForwarding() {
        // PTY 模式下 stderr 已合流到 stdout（ShellLauncher.setRedirectErrorStream(true)），
        // 只起 1 条转发线程。
        stdoutThread = Thread.ofVirtual()
                .name("webterm-stdout-" + sessionId)
                .start(() -> forward(process.getInputStream()));
        Thread.ofVirtual()
                .name("webterm-wait-" + sessionId)
                .start(this::waitForExit);
    }

    public void writeStdin(String data) {
        if (closed.get() || data == null || data.isEmpty()) {
            return;
        }
        OutputStream out = process.getOutputStream();
        synchronized (stdinLock) {
            try {
                out.write(data.getBytes(StandardCharsets.UTF_8));
                out.flush();
            } catch (IOException e) {
                log.debug("[webterm:{}] write stdin failed (process likely exited): {}", sessionId, e.getMessage());
            }
        }
    }

    public void setSize(int cols, int rows) {
        this.cols = cols;
        this.rows = rows;
        if (closed.get() || !process.isAlive()) return;
        try {
            process.setWinSize(new WinSize(Math.max(20, cols), Math.max(5, rows)));
        } catch (Exception e) {
            log.debug("[webterm:{}] setWinSize failed: {}", sessionId, e.getMessage());
        }
    }

    /**
     * WebSocket 断开但 PTY 继续存活。启动一个 idle 计时器，超时后强制 close。
     * idempotent —— 多次 detach 不会启动多个计时器。
     */
    public void detach() {
        WebSocketSession old = wsRef.getAndSet(null);
        if (old != null && old.isOpen()) {
            try {
                old.close(CloseStatus.NORMAL);
            } catch (IOException ignore) { }
        }
        cancelDetachIdle();
        long timeout = props.getDetachIdleTimeoutMs();
        if (timeout > 0 && !closed.get()) {
            detachIdleTask = scheduler.schedule(() -> {
                if (!isAttached() && !closed.get()) {
                    log.info("[webterm:{}] detach idle {}ms 超时，关闭 PTY", sessionId, timeout);
                    close();
                }
            }, timeout, TimeUnit.MILLISECONDS);
        }
        log.info("[webterm:{}] detached（PTY 保活中，idle 超时={}ms）", sessionId, timeout);
    }

    /**
     * 新客户端接回这条 PTY 会话。切换 ws、回放 backlog、按新尺寸 resize PTY。
     * PTY 已退出但还留着 backlog 没回收的情况：回放 + 立刻发 Exit + 进入 close。
     */
    public synchronized void attach(WebSocketSession newWs, int newCols, int newRows) {
        if (closed.get()) {
            return;
        }
        cancelDetachIdle();
        wsRef.set(newWs);
        setSize(newCols, newRows);

        String snapshot = backlog.snapshot();
        if (!snapshot.isEmpty()) {
            sendMessage(new ServerMessage.Output(snapshot));
        }
        if (exited) {
            sendMessage(new ServerMessage.Exit(exitCode));
            close();
        }
    }

    private void cancelDetachIdle() {
        ScheduledFuture<?> t = detachIdleTask;
        if (t != null) {
            t.cancel(false);
            detachIdleTask = null;
        }
    }

    /** 永久关闭：PTY 杀掉、ws 关闭、从 registry 摘除。幂等。 */
    public void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        cancelDetachIdle();
        try {
            if (process.isAlive()) {
                process.destroyForcibly();
            }
        } catch (Exception ignore) { }
        if (stdoutThread != null) stdoutThread.interrupt();

        WebSocketSession ws = wsRef.getAndSet(null);
        if (ws != null && ws.isOpen()) {
            try {
                ws.close(CloseStatus.NORMAL);
            } catch (IOException e) {
                log.debug("[webterm:{}] ws close failed: {}", sessionId, e.getMessage());
            }
        }
        if (onPermanentClose != null) onPermanentClose.run();
    }

    public void sendMessage(ServerMessage msg) {
        WebSocketSession ws = wsRef.get();
        if (ws == null || !ws.isOpen()) {
            return;
        }
        String json;
        try {
            json = mapper.writeValueAsString(msg);
        } catch (JsonProcessingException e) {
            log.warn("[webterm:{}] serialize message failed: {}", sessionId, e.getMessage());
            return;
        }
        synchronized (wsSendLock) {
            try {
                ws.sendMessage(new TextMessage(json));
            } catch (IOException e) {
                log.debug("[webterm:{}] sendMessage failed: {}", sessionId, e.getMessage());
            }
        }
    }

    private void forward(InputStream in) {
        byte[] buf = new byte[Math.max(1024, props.getOutputBufferBytes())];
        StringBuilder pending = new StringBuilder();
        long lastFlush = System.currentTimeMillis();
        long flushIntervalMs = Math.max(10L, props.getOutputFlushIntervalMs());
        int thresholdBytes = Math.max(1024, props.getOutputBufferBytes());

        try {
            while (!closed.get()) {
                int n = in.read(buf);
                if (n < 0) {
                    break;
                }
                if (n > 0) {
                    String chunk = new String(buf, 0, n, StandardCharsets.UTF_8);
                    backlog.append(chunk); // 不管有没有 ws 都先入回放
                    pending.append(chunk);
                }
                long now = System.currentTimeMillis();
                int approxBytes = pending.length();
                if (approxBytes >= thresholdBytes || (approxBytes > 0 && now - lastFlush >= flushIntervalMs)) {
                    flush(pending);
                    lastFlush = now;
                }
            }
        } catch (IOException e) {
            log.debug("[webterm:{}] read stream interrupted: {}", sessionId, e.getMessage());
        } finally {
            if (pending.length() > 0) {
                flush(pending);
            }
        }
    }

    private void flush(StringBuilder pending) {
        String chunk = pending.toString();
        pending.setLength(0);
        // sendMessage 自己处理「ws 不在」的情况；不在就只走 backlog 不发送
        sendMessage(new ServerMessage.Output(chunk));
    }

    private void waitForExit() {
        try {
            int code = process.waitFor();
            if (closed.get()) {
                return;
            }
            // 等转发线程把残留 buffer flush 干净
            if (stdoutThread != null) {
                try { stdoutThread.join(500); } catch (InterruptedException ignore) { }
            }
            exitCode = code;
            exited = true;
            if (isAttached()) {
                sendMessage(new ServerMessage.Exit(code));
                close();
            } else {
                // 客户端不在，PTY 已退出。保留会话和 backlog 等下一次 attach 看尾巴；
                // 由 detach 触发的 idle 计时器或下一次 attach 完成后的 close 收尾。
                log.info("[webterm:{}] PTY 在 detached 状态下退出（code={}），保留 backlog 等待 attach", sessionId, code);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
