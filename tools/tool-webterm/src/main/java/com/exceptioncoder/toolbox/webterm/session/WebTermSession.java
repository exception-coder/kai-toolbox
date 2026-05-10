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
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
public class WebTermSession {

    @Getter private final String sessionId = UUID.randomUUID().toString();
    @Getter private final String shell;
    @Getter private final String cwd;
    private final WebSocketSession ws;
    private final PtyProcess process;
    private final WebTermProperties props;
    private final ObjectMapper mapper;

    private final AtomicBoolean closed = new AtomicBoolean(false);
    private final Object stdinLock = new Object();
    private final Object wsSendLock = new Object();

    private volatile int cols = 80;
    private volatile int rows = 24;

    private Thread stdoutThread;

    public WebTermSession(WebSocketSession ws,
                          PtyProcess process,
                          String shell,
                          String cwd,
                          int cols,
                          int rows,
                          WebTermProperties props,
                          ObjectMapper mapper) {
        this.ws = ws;
        this.process = process;
        this.shell = shell;
        this.cwd = cwd;
        this.cols = cols;
        this.rows = rows;
        this.props = props;
        this.mapper = mapper;
    }

    public WebSocketSession ws() {
        return ws;
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

    /** 主动关闭（前端 close / 服务停机 / 上限超出）。幂等。 */
    public void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        try {
            if (process.isAlive()) {
                process.destroyForcibly();
            }
        } catch (Exception ignore) { }
        if (stdoutThread != null) stdoutThread.interrupt();

        if (ws.isOpen()) {
            try {
                ws.close(CloseStatus.NORMAL);
            } catch (IOException e) {
                log.debug("[webterm:{}] ws close failed: {}", sessionId, e.getMessage());
            }
        }
    }

    public void sendMessage(ServerMessage msg) {
        if (!ws.isOpen()) {
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
                    pending.append(new String(buf, 0, n, StandardCharsets.UTF_8));
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
            sendMessage(new ServerMessage.Exit(code));
            close();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
