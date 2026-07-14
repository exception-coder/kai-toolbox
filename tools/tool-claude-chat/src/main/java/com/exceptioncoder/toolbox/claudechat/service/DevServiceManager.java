package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * 通用「开发服务」进程生命周期 + 前台日志，<b>按项目 id 多实例键控</b>——同一台工作台可同时托管
 * 多个项目的服务（如 ERP 的 Resin、kai-toolbox 自身的 spring-boot:run / npm dev），互不干扰。
 *
 * <p>每个实例：ProcessBuilder 托管拉起启动命令，虚拟线程逐行捕获 stdout/stderr（按控制台原生编码 GBK 读，
 * 避免中文乱码）进环形缓冲，并经 SSE（key={@code dev-service:<id>}）实时推送到工作台；停服默认结束进程树。
 * 是「XX 需求开发」工作台模块脚手架的公共运行时底座。参照 {@link SidecarProcessRegistry} 的进程管理范式。</p>
 */
@Slf4j
@Component
public class DevServiceManager {

    private static final int MAX_LINES = 2000;
    private static final boolean WINDOWS = System.getProperty("os.name", "").toLowerCase().contains("win");
    /**
     * 读进程 stdout 的编码：Windows 控制台默认本地代码页（中文 = GBK/936），而 JVM file.encoding 在
     * Java 18+ 默认 UTF-8——直接按 UTF-8 读会把中文日志读成乱码。优先 {@code native.encoding}，Windows 兜底 GBK。
     */
    private static final Charset CONSOLE_CHARSET = pickConsoleCharset();

    /** SSE key 前缀：一个项目一条流。 */
    public static String sseKey(String id) {
        return "dev-service:" + id;
    }

    private final SseEmitterRegistry sse;
    private final Map<String, Instance> instances = new ConcurrentHashMap<>();

    public DevServiceManager(SseEmitterRegistry sse) {
        this.sse = sse;
    }

    private Instance inst(String id) {
        return instances.computeIfAbsent(id, Instance::new);
    }

    public boolean isRunning(String id) {
        return inst(id).isRunning();
    }

    public Map<String, Object> status(String id) {
        return inst(id).status();
    }

    public List<String> snapshot(String id) {
        return inst(id).snapshot();
    }

    public String start(String id, String cwd, String cmd) {
        return inst(id).start(cwd, cmd);
    }

    public String stop(String id, String stopCommand, List<Integer> ports) {
        return inst(id).stop(stopCommand, ports);
    }

    @PreDestroy
    public void shutdownAll() {
        for (Instance i : instances.values()) {
            i.shutdown();
        }
    }

    // —— 单实例 ——

    /** 一个项目的服务实例（进程 + 环形缓冲 + 状态），方法级同步。 */
    private final class Instance {
        private final String id;
        private Process process;
        private String workDir;
        private String command;
        private long startedAt;
        private final Deque<String> ring = new ArrayDeque<>();

        Instance(String id) {
            this.id = id;
        }

        synchronized boolean isRunning() {
            return process != null && process.isAlive();
        }

        synchronized Map<String, Object> status() {
            boolean running = isRunning();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", id);
            m.put("running", running);
            m.put("pid", running ? process.pid() : null);
            m.put("workDir", workDir);
            m.put("command", command);
            m.put("startedAt", running ? startedAt : null);
            m.put("uptimeMs", running ? System.currentTimeMillis() - startedAt : null);
            return m;
        }

        synchronized List<String> snapshot() {
            return new ArrayList<>(ring);
        }

        synchronized String start(String cwd, String cmd) {
            if (isRunning()) {
                return "服务已在运行（pid=" + process.pid() + "），如需重启请先停止";
            }
            if (cwd == null || cwd.isBlank()) {
                return "请先选择项目目录";
            }
            if (cmd == null || cmd.isBlank()) {
                return "请填写启动命令";
            }
            Path dir = Path.of(cwd);
            if (!Files.isDirectory(dir)) {
                return "项目目录不存在：" + cwd;
            }
            String effCmd = cmd.trim();
            try {
                ring.clear();
                ProcessBuilder pb = new ProcessBuilder(wrap(effCmd)).directory(dir.toFile()).redirectErrorStream(true);
                process = pb.start();
                workDir = cwd;
                command = effCmd;
                startedAt = System.currentTimeMillis();
                pumpLogs(process);
                watchExit(process);
                emit("▶ 启动中：" + effCmd + "（cwd=" + cwd + "，pid=" + process.pid() + "）");
                log.info("[dev-service:{}] 启动 pid={} cwd={} cmd={}", id, process.pid(), cwd, effCmd);
                return null;
            } catch (IOException e) {
                return "启动失败：" + e.getMessage();
            }
        }

        /**
         * 停服。健壮性关键：
         * <ol>
         *   <li>先跑用户的 stopCommand（若配了，best-effort）；</li>
         *   <li><b>整棵进程树强杀</b>——Windows 用 {@code taskkill /F /T /PID}（OS 走父子树，比 JDK
         *       {@code descendants().destroy()} 可靠，能杀到 powershell 下的 Resin/java 等子孙）；</li>
         *   <li><b>按端口兜底</b>——对传入的 ports，杀掉仍在 LISTENING 的占用进程（catch 掉脱离进程树的存活者，
         *       正是"重启没杀掉旧服务、端口占用起不来"的根因）；</li>
         *   <li>等端口释放再返回，避免紧接着 start 撞 EADDRINUSE 又失败。</li>
         * </ol>
         * 即便本工作台已不再跟踪该进程（process 已 null/退出），只要给了 ports 仍会做端口兜底清理。
         */
        synchronized String stop(String stopCommand, List<Integer> ports) {
            boolean hadProc = process != null && process.isAlive();
            List<Integer> validPorts = normalizePorts(ports);
            if (!hadProc && validPorts.isEmpty()) {
                return "服务未在运行";
            }
            long pid = hadProc ? process.pid() : -1;
            try {
                if (stopCommand != null && !stopCommand.isBlank() && workDir != null) {
                    try {
                        new ProcessBuilder(wrap(stopCommand.trim())).directory(Path.of(workDir).toFile())
                                .redirectErrorStream(true).start();
                        appendLine("⏹ 已执行停服命令：" + stopCommand.trim());
                    } catch (IOException e) {
                        appendLine("⚠ 停服命令执行失败（继续强杀）：" + e.getMessage());
                    }
                }
                if (hadProc) {
                    killTree(process);
                }
                for (int p : validPorts) {
                    killByPort(p);
                }
                if (hadProc) {
                    process.destroyForcibly();
                    process.waitFor(6, TimeUnit.SECONDS);
                }
                if (!validPorts.isEmpty()) {
                    waitPortsFree(validPorts, 4000);
                }
                emit(hadProc ? "⏹ 已停止服务（pid=" + pid + "）" : "⏹ 已清理端口占用");
                log.info("[dev-service:{}] 停止 pid={} ports={}", id, pid, validPorts);
                return null;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return "停止被中断";
            }
        }

        /** 强杀整棵进程树：Windows 走 taskkill /F /T，其余用 JDK 递归 destroyForcibly。 */
        private void killTree(Process p) {
            long pid = p.pid();
            List<ProcessHandle> desc = p.descendants().collect(Collectors.toList());
            if (WINDOWS) {
                runQuiet(List.of("taskkill", "/F", "/T", "/PID", Long.toString(pid)));
            }
            // 跨平台兜底 / 非 Windows：强杀子孙 + 自身
            desc.forEach(ProcessHandle::destroyForcibly);
            p.destroyForcibly();
        }

        /** 端口兜底：杀掉仍 LISTENING 在该端口的进程（连同其子树）。绝不误杀本后端自身。 */
        private void killByPort(int port) {
            Long pid = findPidOnPort(port);
            if (pid == null || pid == ProcessHandle.current().pid()) {
                return;
            }
            if (WINDOWS) {
                runQuiet(List.of("taskkill", "/F", "/T", "/PID", pid.toString()));
            } else {
                ProcessHandle.of(pid).ifPresent(h -> {
                    h.descendants().forEach(ProcessHandle::destroyForcibly);
                    h.destroyForcibly();
                });
            }
            appendLine("⏹ 端口 " + port + " 兜底清理占用进程 pid=" + pid);
            log.info("[dev-service:{}] 端口 {} 占用 pid={} 已清理", id, port, pid);
        }

        private void pumpLogs(Process p) {
            Thread.ofVirtual().name("dev-service-log-" + id).start(() -> {
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

        private void watchExit(Process p) {
            Thread.ofVirtual().name("dev-service-exit-" + id).start(() -> {
                try {
                    int code = p.waitFor();
                    emit("■ 进程已退出，exit=" + code);
                    log.info("[dev-service:{}] 进程退出 exit={}", id, code);
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
            sse.publish(sseKey(id), "log", line);
        }

        private void emit(String line) {
            appendLine(line);
            sse.publish(sseKey(id), "status", status());
        }

        synchronized void shutdown() {
            if (isRunning()) {
                log.info("[dev-service:{}] 后端关闭，一并停止 pid={}", id, process.pid());
                try {
                    killTree(process);
                    process.waitFor(3, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }
    }

    // —— 进程/端口清理工具 ——

    /** 规整端口列表：去空、越界、去重。 */
    private static List<Integer> normalizePorts(List<Integer> ports) {
        if (ports == null) {
            return List.of();
        }
        return ports.stream().filter(p -> p != null && p > 0 && p <= 65535).distinct().collect(Collectors.toList());
    }

    /** 跑一条命令、丢弃输出、最多等 5s（用于 taskkill 等）。 */
    private static void runQuiet(List<String> cmd) {
        try {
            Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            p.getInputStream().readAllBytes(); // 排空避免管道阻塞
            p.waitFor(5, TimeUnit.SECONDS);
        } catch (IOException e) {
            // 忽略：kill 类命令失败不致命
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** 查 127.0.0.1:port 上处于 LISTENING 的占用进程 pid（Windows netstat / *nix lsof）。 */
    private static Long findPidOnPort(int port) {
        List<String> cmd = WINDOWS
                ? List.of("cmd", "/c", "netstat -ano -p tcp | findstr LISTENING | findstr :" + port)
                : List.of("sh", "-c", "lsof -ti tcp:" + port + " -sTCP:LISTEN");
        try {
            Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            p.waitFor(3, TimeUnit.SECONDS);
            for (String raw : out.split("\\R")) {
                String line = raw.trim();
                if (line.isEmpty()) {
                    continue;
                }
                if (WINDOWS) {
                    if (!line.contains("LISTENING") || !line.contains(":" + port)) {
                        continue;
                    }
                    String[] parts = line.split("\\s+");
                    try {
                        return Long.parseLong(parts[parts.length - 1]);
                    } catch (NumberFormatException ignore) {
                        // 下一行
                    }
                } else {
                    try {
                        return Long.parseLong(line);
                    } catch (NumberFormatException ignore) {
                        // 下一行
                    }
                }
            }
        } catch (IOException e) {
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return null;
    }

    /** 轮询等一组端口全部释放，最多 maxMs。 */
    private static void waitPortsFree(List<Integer> ports, long maxMs) {
        long deadline = System.nanoTime() + maxMs * 1_000_000L;
        while (System.nanoTime() < deadline) {
            boolean anyOpen = false;
            for (int p : ports) {
                if (isPortOpen(p)) {
                    anyOpen = true;
                    break;
                }
            }
            if (!anyOpen) {
                return;
            }
            try {
                Thread.sleep(150);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private static boolean isPortOpen(int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress("127.0.0.1", port), 200);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    // —— 工具 ——

    /** 用平台 shell 包裹命令：Windows 走 powershell -Command，其余走 sh -c。 */
    private static List<String> wrap(String cmd) {
        if (WINDOWS) {
            return List.of("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd);
        }
        return List.of("sh", "-c", cmd);
    }

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
}
