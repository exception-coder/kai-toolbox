package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

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
     * 杀掉仍占端口的旧 sidecar（上一轮后端遗留、@PreDestroy 未跑到时的孤儿），确保拉起的是当前构建。
     * 两条腿定位，互为兜底：
     * <ol>
     *   <li>pid 文件：sidecar 监听成功时把自身 pid 写入 {@code ~/.kai-toolbox/claude-sidecar.pid}；</li>
     *   <li>端口占用：pid 文件缺失/失效（如修复前启动、无 pid 文件的孤儿）时，按 OS 命令查 18890 的
     *       LISTENING 占用进程。</li>
     * </ol>
     * 只在进程存活、且（取不到名或名字像 node）时才杀，避免 pid 复用误伤；最后轮询确认端口释放，
     * 避免新实例立刻撞 EADDRINUSE 又退回旧实例。
     */
    private void killOrphanSidecar() {
        int port = props.getSidecarPort();
        Long pid = readPidFile();
        if (pid != null) {
            killPidIfNode(pid, "pid 文件");
        }
        // pid 文件没搞定（缺失/失效/杀不干净）而端口仍被占：按端口找占用者兜底
        if (isPortOccupied(port)) {
            Long portPid = findPidOnPort(port);
            if (portPid != null) {
                killPidIfNode(portPid, "端口占用");
            }
        }
        if (isPortOccupied(port) && !waitPortFree(port, 2500)) {
            log.warn("[claude-chat] 端口 {} 仍被占用，新 sidecar 可能退回旧实例；如仍异常请手动结束占用进程", port);
        }
    }

    private Long readPidFile() {
        Path pidFile = Path.of(System.getProperty("user.home"), ".kai-toolbox", "claude-sidecar.pid");
        if (!Files.isRegularFile(pidFile)) {
            return null;
        }
        try {
            return Long.parseLong(Files.readString(pidFile, StandardCharsets.UTF_8).trim());
        } catch (IOException | NumberFormatException e) {
            return null;
        }
    }

    /** 优雅终止指定 pid（先 destroy，3s 未退再强杀）。跳过本进程、非 node 进程。 */
    private void killPidIfNode(long pid, String via) {
        if (pid == ProcessHandle.current().pid()) {
            return;
        }
        ProcessHandle handle = ProcessHandle.of(pid).orElse(null);
        if (handle == null || !handle.isAlive()) {
            return;
        }
        String cmd = handle.info().command().orElse("").toLowerCase();
        if (!cmd.isEmpty() && !cmd.contains("node")) {
            log.warn("[claude-chat] {}定位 pid={} 为非 node 进程（{}），跳过清理", via, pid, cmd);
            return;
        }
        log.info("[claude-chat] 终止遗留 sidecar（{}）pid={}，改拉当前构建", via, pid);
        handle.destroy();
        try {
            handle.onExit().get(3, TimeUnit.SECONDS);
        } catch (Exception e) {
            handle.destroyForcibly();
        }
    }

    /** 端口是否有监听者（本机短连接探测）。 */
    private boolean isPortOccupied(int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress("127.0.0.1", port), 200);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /** 轮询等端口释放，最多 maxMs。 */
    private boolean waitPortFree(int port, long maxMs) {
        long deadline = System.nanoTime() + maxMs * 1_000_000L;
        while (System.nanoTime() < deadline) {
            if (!isPortOccupied(port)) {
                return true;
            }
            sleep(150);
        }
        return !isPortOccupied(port);
    }

    /** 按 OS 命令查 port 上处于 LISTENING 的占用进程 pid（Windows netstat / *nix lsof）。 */
    private Long findPidOnPort(int port) {
        boolean windows = System.getProperty("os.name", "").toLowerCase().contains("win");
        List<String> cmd = windows
                ? List.of("cmd", "/c", "netstat -ano -p tcp | findstr LISTENING | findstr :" + port)
                : List.of("sh", "-c", "lsof -ti tcp:" + port + " -sTCP:LISTEN");
        try {
            Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            StringBuilder out = new StringBuilder();
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    out.append(line).append('\n');
                }
            }
            p.waitFor(2, TimeUnit.SECONDS);
            return parsePidFromPortScan(out.toString(), windows, port);
        } catch (IOException e) {
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    private Long parsePidFromPortScan(String out, boolean windows, int port) {
        for (String raw : out.split("\\R")) {
            String line = raw.trim();
            if (line.isEmpty()) {
                continue;
            }
            if (windows) {
                // 形如： TCP    127.0.0.1:18890   0.0.0.0:0   LISTENING   54228
                if (!line.contains("LISTENING") || !line.contains(":" + port)) {
                    continue;
                }
                String[] parts = line.split("\\s+");
                try {
                    return Long.parseLong(parts[parts.length - 1]);
                } catch (NumberFormatException ignore) {
                    // 换下一行
                }
            } else {
                // lsof -ti 每行一个 pid
                try {
                    return Long.parseLong(line);
                } catch (NumberFormatException ignore) {
                    // 换下一行
                }
            }
        }
        return null;
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * 定位 sidecar 目录，三级查找策略：
     *
     * <ol>
     *   <li>绝对路径：直接用（用户显式配置，最优先）。</li>
     *   <li>从 jar/class 文件所在目录向上逐级找：适合 fat jar 分发场景——
     *       用户把 kai-toolbox.jar 和 sidecar/ 放在同一目录，从任意工作目录启动均可定位。</li>
     *   <li>从 user.dir 向上逐级找：兼容 mvn spring-boot:run 等开发启动方式。</li>
     * </ol>
     *
     * <p>分发包推荐布局：
     * <pre>
     *   任意目录/
     *   ├── kai-toolbox.jar
     *   └── sidecar/
     *       └── claude-agent/
     *           └── dist/server.js
     * </pre>
     */
    private Path resolveSidecarDir() {
        Path configured = Path.of(props.getSidecarDir());
        if (configured.isAbsolute()) {
            return configured;
        }
        // 策略 2：从 jar/class 文件所在目录向上找（分发场景）
        Path jarDir = getJarOrClassesDir();
        if (jarDir != null) {
            Path found = searchUpward(jarDir, configured);
            if (found != null) {
                log.debug("[claude-chat] sidecar 定位于 jar 同级目录：{}", found);
                return found;
            }
        }
        // 策略 3：从 user.dir 向上找（开发/mvn 启动场景）
        Path fromUserDir = searchUpward(Path.of(System.getProperty("user.dir")).toAbsolutePath(), configured);
        if (fromUserDir != null) {
            return fromUserDir;
        }
        // 兜底：user.dir 相对（错误信息里给出绝对路径便于排查）
        return Path.of(System.getProperty("user.dir")).resolve(configured);
    }

    /**
     * 获取当前运行 jar/classes 文件所在目录。
     * - fat jar 启动：返回 jar 文件所在目录（分发根）。
     * - mvn spring-boot:run / IDE：返回 classes 目录（开发时由 searchUpward 向上找到项目根）。
     */
    private Path getJarOrClassesDir() {
        try {
            java.net.URL loc = SidecarProcessRegistry.class.getProtectionDomain().getCodeSource().getLocation();
            if (loc == null) return null;
            String scheme = loc.getProtocol();
            if ("jar".equals(scheme)) {
                // jar:file:/path/to/app.jar!/ -> 提取实际的 jar 文件路径
                String urlStr = loc.toString();
                int bangIdx = urlStr.indexOf('!');
                if (bangIdx > 0) {
                    String jarUrl = urlStr.substring(4, bangIdx); // 去掉 "jar:" 前缀
                    Path p = Path.of(new java.net.URL(jarUrl).toURI()).toAbsolutePath();
                    return p.getParent();
                }
            }
            // 非 jar 或解析失败：从 file:// URL 直接转换，避免 ZipPath 冲突
            Path p = Path.of(loc.toURI()).toAbsolutePath();
            return Files.isRegularFile(p) ? p.getParent() : p;
        } catch (Exception e) {
            return null;
        }
    }

    /** 从 start 目录起逐级向上（最多 5 层），找到包含 sidecar entry 或 package.json 的候选路径。 */
    private Path searchUpward(Path start, Path relative) {
        Path cur = start;
        for (int i = 0; i < 5 && cur != null; i++) {
            Path cand = cur.resolve(relative);
            if (Files.isRegularFile(cand.resolve(props.getEntryScript()))
                    || Files.isRegularFile(cand.resolve("package.json"))) {
                return cand;
            }
            cur = cur.getParent();
        }
        return null;
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
