package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Files;
import java.io.File;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** 执行 Forge 环境白名单命令，统一处理 Windows shim、超时与输出截断。 */
@Component("claudeChatForgeEnvironmentCommandRunner")
public class ForgeEnvironmentCommandRunner {

    private static final boolean WINDOWS = System.getProperty("os.name", "")
            .toLowerCase(Locale.ROOT).contains("win");
    private static final int MAX_OUTPUT_LENGTH = 16_000;
    private volatile String effectivePath = System.getenv("PATH");

    private volatile long pathCheckedAt;

    /** @return 当前检测使用的 PATH */
    public String environmentPath() {
        return effectivePath;
    }

    /** @param force 是否强制刷新 PATH */
    public synchronized void prepareEnvironmentPath(boolean force) {
        if (force || System.nanoTime() - pathCheckedAt > TimeUnit.SECONDS.toNanos(60) || pathCheckedAt == 0) {
            refreshEnvironmentPath();
            pathCheckedAt = System.nanoTime();
        }
    }

    /** 使用不可变 PATH 快照执行探测，避免其他请求更新路径影响本次结果。 */
    public CommandResult runWithPath(List<String> command, Duration timeout, String path) {
        return execute(command, timeout, null, null, path, MAX_OUTPUT_LENGTH);
    }

    /** Go 批量协议输出包含多个有界结果，使用独立的总输出上限。 */
    public CommandResult runProtocol(List<String> command, Duration timeout, String path) {
        return execute(command, timeout, null, null, path, 256_000);
    }

    /**
     * 执行调用方代码内声明的固定 argv。
     *
     * @param command 固定命令及参数
     * @param timeout 最长执行时间
     * @param workingDirectory 可选工作目录
     * @param outputConsumer 可选逐行输出消费者
     * @return 有界命令结果
     */
    public CommandResult run(List<String> command, Duration timeout, Path workingDirectory,
                             Consumer<String> outputConsumer) {
        return execute(command, timeout, workingDirectory, outputConsumer, effectivePath, MAX_OUTPUT_LENGTH);
    }

    private CommandResult execute(List<String> command, Duration timeout, Path workingDirectory,
                                  Consumer<String> outputConsumer, String path, int outputLimit) {
        Process process = null;
        try {
            ProcessBuilder builder = new ProcessBuilder(resolve(command, path)).redirectErrorStream(true);
            if (path != null && !path.isBlank()) {
                builder.environment().put("PATH", path);
            }
            if (workingDirectory != null) {
                builder.directory(workingDirectory.toFile());
            }
            process = builder.start();
            Process started = process;
            StringBuilder output = new StringBuilder();
            Thread reader = Thread.ofVirtual().name("forge-environment-command-output").start(() ->
                    drain(started, output, outputConsumer, outputLimit));
            boolean completed = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (!completed) {
                terminateTree(process);
                process.waitFor(2, TimeUnit.SECONDS);
            }
            reader.join(2_000L);
            synchronized (output) {
                return new CommandResult(completed ? process.exitValue() : -1, completed,
                        completed ? output.toString().trim() : "命令检测超时：" + command.getFirst());
            }
        } catch (IOException exception) {
            return new CommandResult(exception instanceof java.nio.file.NoSuchFileException ? 127 : -1,
                    false, compact(exception.getMessage(), "命令无法启动"));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            if (process != null) {
                terminateTree(process);
            }
            return new CommandResult(-1, false, "命令执行被中断");
        }
    }

    /** 重新读取 Windows 用户与系统 PATH，使后续安装步骤无需重启 Forge 即可发现新命令。 */
    public void refreshEnvironmentPath() {
        if (!WINDOWS) {
            return;
        }
        CommandResult result = run(List.of(
                "powershell.exe",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "$machine=[Environment]::GetEnvironmentVariable('Path','Machine');"
                        + "$user=[Environment]::GetEnvironmentVariable('Path','User');"
                        + "[Console]::Out.Write($machine+';'+$user)"),
                Duration.ofSeconds(10), null, null);
        if (result.succeeded() && !result.output().isBlank()) {
            effectivePath = mergePaths(effectivePath, result.output());
        }
        CommandResult uvToolBin = run(List.of("uv", "tool", "dir", "--bin"),
                Duration.ofSeconds(10), null, null);
        if (uvToolBin.succeeded() && !uvToolBin.output().isBlank()) {
            effectivePath = mergePaths(effectivePath, uvToolBin.output());
        }
    }

    private static void terminateTree(Process process) {
        process.descendants().forEach(ProcessHandle::destroyForcibly);
        process.destroyForcibly();
    }

    private void drain(Process process, StringBuilder output, Consumer<String> outputConsumer, int limit) {
        try (var reader = process.inputReader(StandardCharsets.UTF_8)) {
            char[] buffer = new char[2048];
            int count;
            while ((count = reader.read(buffer)) != -1) {
                synchronized (output) {
                    int remaining = limit - output.length();
                    if (remaining > 0) {
                        output.append(buffer, 0, Math.min(count, remaining));
                    }
                }
                if (outputConsumer != null) {
                    outputConsumer.accept(new String(buffer, 0, count));
                }
            }
        } catch (IOException exception) {
            synchronized (output) {
                if (output.length() == 0) {
                    output.append("命令输出流关闭");
                }
            }
        }
    }

    private static List<String> resolve(List<String> command, String path) throws IOException {
        String executable = command.getFirst();
        Path resolved = Path.of(executable);
        if (!resolved.isAbsolute()) {
            resolved = findExecutable(executable, path);
        }
        if (resolved == null || !Files.isRegularFile(resolved)) {
            throw new java.nio.file.NoSuchFileException("未找到命令：" + executable);
        }
        var arguments = new ArrayList<>(command);
        arguments.set(0, resolved.toString());
        String lower = resolved.toString().toLowerCase(Locale.ROOT);
        return WINDOWS && (lower.endsWith(".cmd") || lower.endsWith(".bat")) ? wrap(arguments) : arguments;
    }

    private static Path findExecutable(String name, String path) {
        var extensions = WINDOWS && !name.contains(".") ? List.of(".com", ".exe", ".bat", ".cmd") : List.of("");
        for (String directory : (path == null ? "" : path).split(java.util.regex.Pattern.quote(File.pathSeparator))) {
            String clean = directory.replace("\"", "").trim();
            if (clean.isEmpty() || !Path.of(clean).isAbsolute()) {
                continue;
            }
            for (String extension : extensions) {
                Path candidate = Path.of(clean, name + extension);
                if (Files.isRegularFile(candidate) && (WINDOWS || Files.isExecutable(candidate))) {
                    return candidate;
                }
            }
        }
        return null;
    }

    private static List<String> wrap(List<String> command) {
        if (!WINDOWS) {
            return command;
        }
        List<String> wrapped = new ArrayList<>(command.size() + 8);
        wrapped.add("cmd.exe");
        wrapped.add("/d");
        wrapped.add("/s");
        wrapped.add("/c");
        wrapped.add("chcp");
        wrapped.add("65001");
        wrapped.add(">nul");
        wrapped.add("&&");
        wrapped.addAll(command);
        return wrapped;
    }

    private static String truncate(String output) {
        String value = output == null ? "" : output.trim();
        return value.length() <= MAX_OUTPUT_LENGTH
                ? value : value.substring(value.length() - MAX_OUTPUT_LENGTH);
    }

    private static String compact(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.replaceAll("\\s+", " ").trim();
    }

    static String mergePaths(String currentPath, String refreshedPath) {
        Map<String, String> entries = new LinkedHashMap<>();
        List<String> appExecutionAliases = new ArrayList<>();
        addPathEntries(entries, appExecutionAliases, refreshedPath);
        addPathEntries(entries, appExecutionAliases, currentPath);
        appExecutionAliases.forEach(entry -> entries.putIfAbsent(entry.toLowerCase(Locale.ROOT), entry));
        return String.join(";", entries.values());
    }

    private static void addPathEntries(Map<String, String> entries, List<String> appExecutionAliases, String path) {
        if (path == null || path.isBlank()) {
            return;
        }
        for (String entry : path.split(";")) {
            String normalized = entry.trim();
            if (!normalized.isEmpty()) {
                if (isWindowsAppsPath(normalized)) {
                    appExecutionAliases.add(normalized);
                } else {
                    entries.putIfAbsent(normalized.toLowerCase(Locale.ROOT), normalized);
                }
            }
        }
    }

    private static boolean isWindowsAppsPath(String path) {
        return path.replace('/', '\\').toLowerCase(Locale.ROOT).endsWith("\\microsoft\\windowsapps");
    }

    /**
     * @param exitCode 进程退出码，未正常结束为 -1
     * @param completed 是否在时限内正常结束
     * @param output 合并并截断后的输出
     */
    public record CommandResult(int exitCode, boolean completed, String output) {
        /** @return 命令是否成功完成 */
        public boolean succeeded() {
            return completed && exitCode == 0;
        }
    }
}
