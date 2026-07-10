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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

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

    public String stop(String id, String stopCommand) {
        return inst(id).stop(stopCommand);
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

        synchronized String stop(String stopCommand) {
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
                process.descendants().forEach(ProcessHandle::destroy);
                process.destroy();
                if (!process.waitFor(5, TimeUnit.SECONDS)) {
                    process.descendants().forEach(ProcessHandle::destroyForcibly);
                    process.destroyForcibly();
                }
                emit("⏹ 已停止服务（pid=" + pid + "）");
                log.info("[dev-service:{}] 停止 pid={}", id, pid);
                return null;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return "停止被中断";
            } catch (IOException e) {
                return "停止失败：" + e.getMessage();
            }
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
