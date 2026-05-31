package com.exceptioncoder.toolbox.docker.service;

import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/**
 * 长连接 SSH 命令封装：在虚拟线程里读 stdout，按 \n 切行回调；提供 {@link #close()} 关 channel + session。
 *
 * 自带每秒最多 1000 行的限速（超出丢弃当前行，避免压垮 SSE）。
 * 30 分钟没读到任何字节自动关闭。
 */
public final class HostSshStream implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(HostSshStream.class);
    private static final long IDLE_TIMEOUT_NANOS = 30L * 60L * 1_000_000_000L; // 30 min
    private static final int MAX_LINES_PER_SECOND = 1000;

    private final Session session;
    private final ChannelExec channel;
    private final AtomicBoolean closed = new AtomicBoolean(false);
    private final Thread reader;

    private HostSshStream(Session session, ChannelExec channel, Thread reader) {
        this.session = session;
        this.channel = channel;
        this.reader = reader;
    }

    /** open 后 reader 已在虚拟线程里跑；onLine 收到每行；onComplete 在 channel 自然结束或 idle 超时时触发。 */
    public static HostSshStream open(Session session, String command,
                                     Consumer<String> onLine, Runnable onComplete) throws JSchException, java.io.IOException {
        ChannelExec channel = (ChannelExec) session.openChannel("exec");
        channel.setCommand(command);
        channel.setInputStream(null);
        channel.setErrStream(System.err, false); // stderr 已被命令 2>&1 合并；这里给个兜底接收器
        InputStream in = channel.getInputStream();
        channel.connect();

        Thread reader = Thread.ofVirtual().name("docker-log-stream").start(() -> {
            ByteArrayOutputStream buf = new ByteArrayOutputStream(8192);
            byte[] chunk = new byte[8192];
            long lastReadNanos = System.nanoTime();
            long currentSecond = -1L;
            int linesInSecond = 0;
            try {
                while (true) {
                    while (in.available() > 0) {
                        int n = in.read(chunk, 0, chunk.length);
                        if (n < 0) break;
                        lastReadNanos = System.nanoTime();
                        for (int i = 0; i < n; i++) {
                            byte b = chunk[i];
                            if (b == '\n') {
                                String line = buf.toString(StandardCharsets.UTF_8);
                                buf.reset();
                                long sec = System.currentTimeMillis() / 1000L;
                                if (sec != currentSecond) {
                                    currentSecond = sec;
                                    linesInSecond = 0;
                                }
                                if (linesInSecond < MAX_LINES_PER_SECOND) {
                                    linesInSecond++;
                                    try { onLine.accept(line); } catch (Exception e) {
                                        log.debug("onLine 抛错：{}", e.getMessage());
                                    }
                                }
                            } else {
                                buf.write(b);
                            }
                        }
                    }
                    if (channel.isClosed()) {
                        if (in.available() > 0) continue;
                        if (buf.size() > 0) {
                            try { onLine.accept(buf.toString(StandardCharsets.UTF_8)); } catch (Exception ignored) {}
                            buf.reset();
                        }
                        break;
                    }
                    if (System.nanoTime() - lastReadNanos > IDLE_TIMEOUT_NANOS) {
                        log.info("docker log stream idle 30min，主动关闭");
                        break;
                    }
                    Thread.sleep(80);
                }
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
            } catch (Exception e) {
                log.debug("reader 异常：{}", e.getMessage());
            } finally {
                try { onComplete.run(); } catch (Exception ignored) {}
            }
        });

        return new HostSshStream(session, channel, reader);
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) return;
        try { channel.disconnect(); } catch (Exception ignored) {}
        try { session.disconnect(); } catch (Exception ignored) {}
        reader.interrupt();
    }
}
