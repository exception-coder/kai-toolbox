package com.exceptioncoder.toolbox.system.update;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** 有界输出、可超时并回收子孙进程的外部命令执行器。命令始终按 argv 传递，不拼接 Git 参数。 */
@Component
public class AutoUpdateCommandRunner {

    private final AutoUpdateProperties properties;

    public AutoUpdateCommandRunner(AutoUpdateProperties properties) {
        this.properties = properties;
    }

    public Result run(Path directory, Duration timeout, List<String> command) {
        return run(directory, timeout, command, Map.of());
    }

    public Result run(Path directory, Duration timeout, List<String> command, Map<String, String> environment) {
        if (command == null || command.isEmpty() || command.getFirst().isBlank()) {
            return Result.failed("命令为空");
        }
        Process process = null;
        try {
            ProcessBuilder builder = new ProcessBuilder(command)
                    .directory(directory.toFile())
                    .redirectErrorStream(false);
            builder.environment().putAll(environment);
            process = builder.start();
            BoundedText stdout = new BoundedText(properties.getMaxOutputBytes());
            BoundedText stderr = new BoundedText(properties.getMaxOutputBytes());
            Process running = process;
            Thread outThread = Thread.ofVirtual().name("auto-update-stdout").start(
                    () -> stdout.read(running.getInputStream()));
            Thread errThread = Thread.ofVirtual().name("auto-update-stderr").start(
                    () -> stderr.read(running.getErrorStream()));
            boolean completed = process.waitFor(Math.max(1, timeout.toMillis()), TimeUnit.MILLISECONDS);
            if (!completed) {
                terminateTree(process);
            }
            outThread.join(2_000);
            errThread.join(2_000);
            int exit = completed ? process.exitValue() : -1;
            return new Result(exit, stdout.text(), stderr.text(), !completed, null);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            if (process != null) terminateTree(process);
            return new Result(-1, "", "", false, "命令被中断");
        } catch (IOException e) {
            if (process != null) terminateTree(process);
            return new Result(-1, "", "", false, sanitize(e.getMessage()));
        }
    }

    public Result runTool(Path directory, Duration timeout, String executable, List<String> arguments) {
        List<String> command = platformCommand(executable, arguments);
        return run(directory, timeout, command);
    }

    static List<String> platformCommand(String executable, List<String> arguments) {
        String value = executable == null ? "" : executable.trim();
        if (value.isBlank()) return List.of();
        boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        String lower = value.toLowerCase(Locale.ROOT);
        if (!windows || (!lower.endsWith(".cmd") && !lower.endsWith(".bat")
                && (lower.endsWith(".exe") || value.contains("\\") || value.contains("/")))) {
            List<String> direct = new ArrayList<>();
            direct.add(value);
            direct.addAll(arguments);
            return direct;
        }
        // Maven/npm 在 Windows 通常是 .cmd；参数来自固定代码，不接受用户自由 shell 片段。
        StringBuilder line = new StringBuilder(quoteCmd(value));
        for (String argument : arguments) line.append(' ').append(quoteCmd(argument));
        return List.of("cmd.exe", "/d", "/s", "/c", line.toString());
    }

    private static String quoteCmd(String value) {
        String safe = value.replace("%", "%%").replace("\"", "\"\"");
        return '"' + safe + '"';
    }

    static void terminateTree(Process process) {
        Set<ProcessHandle> descendants = new HashSet<>(process.descendants().toList());
        expandDescendants(descendants);
        List<ProcessHandle> ordered = new ArrayList<>(descendants);
        for (int i = ordered.size() - 1; i >= 0; i--) ordered.get(i).destroy();
        process.destroy();
        try {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (System.nanoTime() < deadline
                    && (process.isAlive() || descendants.stream().anyMatch(ProcessHandle::isAlive))) {
                Thread.sleep(50);
            }
            // 根进程可能已先退出，但忽略 TERM 的 Maven/npm/git 子孙仍必须强制回收。
            expandDescendants(descendants);
            ordered = new ArrayList<>(descendants);
            for (int i = ordered.size() - 1; i >= 0; i--) {
                ProcessHandle child = ordered.get(i);
                if (child.isAlive()) child.destroyForcibly();
            }
            if (process.isAlive()) process.destroyForcibly();
            process.waitFor(2, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            for (ProcessHandle child : descendants) if (child.isAlive()) child.destroyForcibly();
            process.destroyForcibly();
        }
    }

    private static void expandDescendants(Set<ProcessHandle> handles) {
        List<ProcessHandle> snapshot = new ArrayList<>(handles);
        for (ProcessHandle child : snapshot) handles.addAll(child.descendants().toList());
    }

    static String sanitize(String raw) {
        if (raw == null) return "";
        String value = raw
                .replaceAll("(?i)(https?://)[^/@\\s]+@", "$1***@")
                .replaceAll("(?i)(token|access_token|auth|password)=([^&\\s]+)", "$1=***")
                .replaceAll("(?im)(authorization\\s*:\\s*)[^\\r\\n]+", "$1***");
        return value.length() <= 2_000 ? value : value.substring(0, 2_000) + "…";
    }

    public record Result(int exitCode, String stdout, String stderr, boolean timedOut, String launchError) {
        static Result failed(String message) { return new Result(-1, "", "", false, message); }
        public boolean success() { return launchError == null && !timedOut && exitCode == 0; }
        public String summary() {
            if (launchError != null && !launchError.isBlank()) return sanitize(launchError);
            if (timedOut) return "命令执行超时";
            String detail = stderr == null || stderr.isBlank() ? stdout : stderr;
            detail = sanitize(detail == null ? "" : detail.trim());
            return detail.isBlank() ? "exit=" + exitCode : "exit=" + exitCode + ": " + detail;
        }
    }

    private static final class BoundedText {
        private final int limit;
        private final StringBuilder value = new StringBuilder();
        private boolean truncated;

        private BoundedText(int limit) { this.limit = Math.max(1, limit); }

        private void read(InputStream stream) {
            byte[] buffer = new byte[8_192];
            try (stream) {
                int count;
                while ((count = stream.read(buffer)) >= 0) {
                    if (count == 0) continue;
                    synchronized (this) {
                        int remaining = limit - value.length();
                        if (remaining > 0) {
                            String chunk = new String(buffer, 0, count, StandardCharsets.UTF_8);
                            value.append(chunk, 0, Math.min(remaining, chunk.length()));
                            if (chunk.length() > remaining) truncated = true;
                        } else {
                            truncated = true;
                        }
                    }
                }
            } catch (IOException ignore) {
                // 进程被终止时管道关闭属于正常清理路径。
            }
        }

        private synchronized String text() {
            return truncated ? value + "\n…(output truncated)" : value.toString();
        }
    }
}
