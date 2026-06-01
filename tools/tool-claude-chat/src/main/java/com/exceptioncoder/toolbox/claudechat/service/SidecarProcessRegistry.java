package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Node sidecar 的 OS 进程生命周期。
 *
 * 单进程、懒启动：首次会话时 {@link #ensureStarted()} 拉起 `node dist/server.js`，
 * 进程内可并发多个 SDK 会话（按 sessionId 路由）。进程退出由 {@link SidecarClient}
 * 感知连接断开后驱动会话标记 INTERRUPTED。
 */
@Slf4j
@Component
public class SidecarProcessRegistry {

    private final ClaudeChatProperties props;
    private volatile Process process;

    public SidecarProcessRegistry(ClaudeChatProperties props) {
        this.props = props;
    }

    /** 幂等：进程未启动或已退出则拉起。 */
    public synchronized void ensureStarted() throws IOException {
        if (process != null && process.isAlive()) {
            return;
        }
        Path dir = resolveSidecarDir();
        Path entry = dir.resolve(props.getEntryScript());
        if (!Files.isRegularFile(entry)) {
            throw new IOException("sidecar 入口不存在，请先构建 sidecar：" + entry.toAbsolutePath());
        }

        List<String> cmd = new ArrayList<>();
        cmd.add(props.getNodeCommand());
        cmd.add(props.getEntryScript());

        ProcessBuilder pb = new ProcessBuilder(cmd)
                .directory(dir.toFile())
                .redirectErrorStream(true);
        // sidecar 从环境变量读监听端口，仅绑 127.0.0.1
        pb.environment().put("CLAUDE_CHAT_SIDECAR_PORT", String.valueOf(props.getSidecarPort()));

        process = pb.start();
        startLogPump(process);
        log.info("[claude-chat] sidecar 已启动，pid={}, port={}", process.pid(), props.getSidecarPort());
    }

    public boolean isAlive() {
        return process != null && process.isAlive();
    }

    private Path resolveSidecarDir() {
        Path p = Path.of(props.getSidecarDir());
        if (p.isAbsolute()) {
            return p;
        }
        // 相对路径基于 jar / 工作目录
        return Path.of(System.getProperty("user.dir")).resolve(p);
    }

    /** 把 sidecar 的 stdout/stderr 透到日志，便于排查（虚拟线程，不阻塞）。 */
    private void startLogPump(Process p) {
        Thread.ofVirtual().name("claude-chat-sidecar-log").start(() -> {
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    log.info("[sidecar] {}", line);
                }
            } catch (IOException ignore) {
                // 进程退出，流关闭
            }
        });
    }

    @PreDestroy
    public void shutdown() {
        if (process != null && process.isAlive()) {
            log.info("[claude-chat] 关闭 sidecar 进程 pid={}", process.pid());
            process.destroy();
            try {
                if (!process.waitFor(3, java.util.concurrent.TimeUnit.SECONDS)) {
                    process.destroyForcibly();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                process.destroyForcibly();
            }
        }
    }
}
