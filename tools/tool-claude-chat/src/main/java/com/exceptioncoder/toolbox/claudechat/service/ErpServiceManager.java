package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * ERP 服务（Yoooni Resin console）进程生命周期 + 前台启动日志。
 *
 * <p>由工作台<b>托管拉起</b>启动命令（默认项目根的 {@code start-yoooni.ps1}，Resin console 前台输出），
 * 捕获其 stdout/stderr 进环形缓冲并经 SSE 实时推送到「ERP 需求开发」工作台；停服默认结束进程树
 * （Yoooni 无专用 stop 脚本），也可配 stopCommand。参照 {@link SidecarProcessRegistry} 的进程管理范式。</p>
 *
 * <p>单服务模型：同时只托管一个 ERP 服务进程（ERP 开发通常一个实例）。只能读/停<b>本工作台拉起</b>的进程；
 * 用户自己开窗口起的服务读不到其窗口日志（那属另一个 OS 进程的控制台）。</p>
 */
@Slf4j
@Component
public class ErpServiceManager {

    /** SSE 与日志缓冲的固定 key（单服务）。 */
    public static final String KEY = "erp-service";
    private static final int MAX_LINES = 2000;
    private static final boolean WINDOWS = System.getProperty("os.name", "").toLowerCase().contains("win");
    /**
     * 读进程 stdout 的编码：Windows 控制台默认是本地代码页（中文 = GBK/936），而 JVM 的 file.encoding
     * 在 Java 18+ 默认 UTF-8——直接按 UTF-8 读会把 PowerShell/Resin 的中文日志读成乱码。
     * 优先用 {@code native.encoding}（JVM 暴露的 OS 原生编码），Windows 兜底 GBK，其余用平台默认。
     */
    private static final Charset CONSOLE_CHARSET = pickConsoleCharset();

    private final SseEmitterRegistry sse;

    private volatile Process process;
    private volatile String workDir;
    private volatile String command;
    private volatile long startedAt;
    private final Deque<String> ring = new ArrayDeque<>();

    public ErpServiceManager(SseEmitterRegistry sse) {
        this.sse = sse;
    }

    public synchronized boolean isRunning() {
        return process != null && process.isAlive();
    }

    /** 状态视图，供 /status 与 SSE status 事件。 */
    public synchronized Map<String, Object> status() {
        boolean running = isRunning();
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("running", running);
        m.put("pid", running ? process.pid() : null);
        m.put("workDir", workDir);
        m.put("command", command);
        m.put("startedAt", running ? startedAt : null);
        m.put("uptimeMs", running ? System.currentTimeMillis() - startedAt : null);
        return m;
    }

    /** 环形缓冲当前快照（初次加载用）。 */
    public synchronized List<String> snapshot() {
        return new ArrayList<>(ring);
    }

    /**
     * 启动服务。cwd=ERP 项目根；command 为空则默认跑该目录下 start-yoooni.ps1。
     *
     * @return null=已拉起，否则错误信息
     */
    public synchronized String start(String cwd, String cmd) {
        if (isRunning()) {
            return "服务已在运行（pid=" + process.pid() + "），如需重启请先停止";
        }
        if (cwd == null || cwd.isBlank()) {
            return "请先选择 ERP 项目目录";
        }
        Path dir = Path.of(cwd);
        if (!Files.isDirectory(dir)) {
            return "项目目录不存在：" + cwd;
        }
        String effCmd = (cmd == null || cmd.isBlank()) ? defaultCommand(dir) : cmd.trim();
        List<String> full = wrap(effCmd);
        try {
            clearRing();
            ProcessBuilder pb = new ProcessBuilder(full).directory(dir.toFile()).redirectErrorStream(true);
            process = pb.start();
            workDir = cwd;
            command = effCmd;
            startedAt = System.currentTimeMillis();
            pumpLogs(process);
            watchExit(process);
            emit("started", "▶ 启动中：" + effCmd + "（cwd=" + cwd + "，pid=" + process.pid() + "）");
            log.info("[erp-service] 启动 pid={} cwd={} cmd={}", process.pid(), cwd, effCmd);
            return null;
        } catch (IOException e) {
            return "启动失败：" + e.getMessage();
        }
    }

    /**
     * 停止服务。stopCommand 非空则跑它，否则结束进程树（先杀子孙再杀主进程）。
     *
     * @return null=成功，否则错误信息
     */
    public synchronized String stop(String stopCommand) {
        if (!isRunning()) {
            return "服务未在运行";
        }
        long pid = process.pid();
        try {
            if (stopCommand != null && !stopCommand.isBlank() && workDir != null) {
                new ProcessBuilder(wrap(stopCommand.trim())).directory(Path.of(workDir).toFile())
                        .redirectErrorStream(true).start();
                appendLine("⏹ 已执行停服命令：" + stopCommand.trim());
            }
            // 无论是否有 stopCommand，都结束我们拉起的进程树，确保 Resin 真停
            process.descendants().forEach(ProcessHandle::destroy);
            process.destroy();
            if (!process.waitFor(5, TimeUnit.SECONDS)) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
            emit("stopped", "⏹ 已停止服务（pid=" + pid + "）");
            log.info("[erp-service] 停止 pid={}", pid);
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "停止被中断";
        } catch (IOException e) {
            return "停止失败：" + e.getMessage();
        }
    }

    // —— 内部 ——

    /** 选控制台读取编码：native.encoding → (Windows) GBK → 平台默认。 */
    private static Charset pickConsoleCharset() {
        String nativeEnc = System.getProperty("native.encoding");
        if (nativeEnc != null && !nativeEnc.isBlank()) {
            try {
                return Charset.forName(nativeEnc);
            } catch (Exception ignore) {
                // 名字不识别，继续兜底
            }
        }
        if (WINDOWS) {
            try {
                return Charset.forName("GBK");
            } catch (Exception ignore) {
                // 无 GBK，用默认
            }
        }
        return Charset.defaultCharset();
    }

    /** 默认启动命令：项目根的 start-yoooni.ps1（Windows）。 */
    private static String defaultCommand(Path dir) {
        return WINDOWS ? ".\\start-yoooni.ps1" : "./start-yoooni.sh";
    }

    /** 用平台 shell 包裹命令：Windows 走 powershell -Command，其余走 sh -c。 */
    private static List<String> wrap(String cmd) {
        if (WINDOWS) {
            return List.of("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd);
        }
        return List.of("sh", "-c", cmd);
    }

    /** 虚拟线程读进程输出：逐行进环形缓冲 + SSE 推送 log 事件。 */
    private void pumpLogs(Process p) {
        Thread.ofVirtual().name("erp-service-log").start(() -> {
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(p.getInputStream(), CONSOLE_CHARSET))) {
                String line;
                while ((line = r.readLine()) != null) {
                    appendLine(line);
                }
            } catch (IOException ignore) {
                // 进程退出，流关闭
            }
        });
    }

    /** 监听进程退出，发 exit 事件（含退出码），解除前端「运行中」。 */
    private void watchExit(Process p) {
        Thread.ofVirtual().name("erp-service-exit").start(() -> {
            try {
                int code = p.waitFor();
                emit("exit", "■ 进程已退出，exit=" + code);
                log.info("[erp-service] 进程退出 exit={}", code);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
    }

    private synchronized void appendLine(String line) {
        ring.addLast(line);
        while (ring.size() > MAX_LINES) {
            ring.removeFirst();
        }
        sse.publish(KEY, "log", line);
    }

    /** 发一条 log（进缓冲）+ 一条 status（带最新状态）。 */
    private void emit(String tag, String line) {
        appendLine(line);
        sse.publish(KEY, "status", status());
    }

    private synchronized void clearRing() {
        ring.clear();
    }

    @PreDestroy
    public void shutdown() {
        if (isRunning()) {
            log.info("[erp-service] 后端关闭，一并停止 ERP 服务 pid={}", process.pid());
            try {
                process.descendants().forEach(ProcessHandle::destroy);
                process.destroy();
                if (!process.waitFor(3, TimeUnit.SECONDS)) {
                    process.descendants().forEach(ProcessHandle::destroyForcibly);
                    process.destroyForcibly();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }
}
