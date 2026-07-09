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
    private final int serverPort;
    private volatile Process process;

    public SidecarProcessRegistry(ClaudeChatProperties props,
                                  @org.springframework.beans.factory.annotation.Value("${server.port:8080}") int serverPort) {
        this.props = props;
        this.serverPort = serverPort;
    }

    /** 幂等：进程未启动或已退出则拉起。 */
    public synchronized void ensureStarted() throws IOException {
        if (process != null && process.isAlive()) {
            return;
        }
        // 走到这＝本后端没有存活的 sidecar。若端口上还有上一轮后端遗留的孤儿 sidecar（旧代码），
        // 后端会连上它导致修复不生效、事件卡死。启动前按 pid 文件精确杀掉它，确保拉起当前构建。
        killOrphanSidecar();
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
        // 后端 HTTP 基址：供 sidecar 的 erp_db 只读 MCP 回灌查询（本机）
        pb.environment().put("TOOLBOX_API_BASE", "http://127.0.0.1:" + serverPort);

        process = pb.start();
        startLogPump(process);
        log.info("[claude-chat] sidecar 已启动，pid={}, port={}", process.pid(), props.getSidecarPort());
    }

    public boolean isAlive() {
        return process != null && process.isAlive();
    }

    /**
     * 按 pid 文件杀掉仍占端口的旧 sidecar（上一轮后端遗留、@PreDestroy 未跑到时的孤儿）。
     * sidecar 监听成功时把自身 pid 写入 {@code ~/.kai-toolbox/claude-sidecar.pid}，这里读它精确定位，
     * 只在进程仍存活、且（无法取名或名字像 node）时才杀，避免 pid 复用误伤。杀完等端口释放。
     */
    private void killOrphanSidecar() {
        Path pidFile = Path.of(System.getProperty("user.home"), ".kai-toolbox", "claude-sidecar.pid");
        if (!Files.isRegularFile(pidFile)) {
            return;
        }
        long pid;
        try {
            pid = Long.parseLong(Files.readString(pidFile, StandardCharsets.UTF_8).trim());
        } catch (IOException | NumberFormatException e) {
            return;
        }
        ProcessHandle handle = ProcessHandle.of(pid).orElse(null);
        if (handle == null || !handle.isAlive()) {
            return;
        }
        String cmd = handle.info().command().orElse("").toLowerCase();
        if (!cmd.isEmpty() && !cmd.contains("node")) {
            // pid 已被非 node 进程复用，不碰
            log.warn("[claude-chat] pid 文件 {} 指向非 node 进程（{}），跳过清理", pid, cmd);
            return;
        }
        log.info("[claude-chat] 发现遗留 sidecar 孤儿进程 pid={}，先终止再拉起当前构建", pid);
        handle.destroy();
        try {
            handle.onExit().get(3, java.util.concurrent.TimeUnit.SECONDS);
        } catch (Exception e) {
            handle.destroyForcibly();
        }
        // 端口释放有短暂延迟，稍等，避免新实例立刻撞 EADDRINUSE 又退出
        sleep(400);
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * 定位 sidecar 目录。相对路径要兼容不同启动方式的工作目录：
     * - mvn spring-boot:run（cwd = toolbox-starter 模块目录）→ 需向上跳到仓库根；
     * - 仓库根直接跑 jar（cwd = 仓库根）→ 直接命中；
     * 因此从 user.dir 起逐级向上找第一个存在的 {sidecarDir}/{entryScript|package.json}。
     */
    private Path resolveSidecarDir() {
        Path configured = Path.of(props.getSidecarDir());
        if (configured.isAbsolute()) {
            return configured;
        }
        Path cur = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        for (int i = 0; i < 5 && cur != null; i++) {
            Path cand = cur.resolve(configured);
            if (Files.isRegularFile(cand.resolve(props.getEntryScript()))
                    || Files.isRegularFile(cand.resolve("package.json"))) {
                return cand;
            }
            cur = cur.getParent();
        }
        // 兜底：按 user.dir 相对（错误信息里给出绝对路径便于排查）
        return Path.of(System.getProperty("user.dir")).resolve(configured);
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
