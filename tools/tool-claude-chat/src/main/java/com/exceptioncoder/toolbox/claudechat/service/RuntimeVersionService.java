package com.exceptioncoder.toolbox.claudechat.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

/**
 * 运行版本可见：启动时记录宿主源码提交，查询时与当前源码 HEAD 比较，回答“正在运行哪个版本、还有哪些提交待加载”。
 *
 * <p>以启动时的 HEAD 近似运行版本：适用于源码守护启动；打包产物在其他目录运行时启动提交可能为空。</p>
 */
@Slf4j
@Service
public class RuntimeVersionService {

    private static final int MAX_PENDING_SUBJECTS = 10;
    private static final long CACHE_MILLIS = 30_000L;

    public record RuntimeVersion(String startedCommit, long startedAt, String sourceHead, Integer pendingCommits,
                                 List<String> pendingSubjects, long checkedAt, String error) { }

    private final Function<List<String>, String> git;
    private final String startedCommit;
    private final long startedAt;
    private volatile RuntimeVersion cached;

    public RuntimeVersionService() {
        this(args -> runGit(Path.of(System.getProperty("user.dir")), args), System.currentTimeMillis());
    }

    RuntimeVersionService(Function<List<String>, String> git, long startedAt) {
        this.git = git;
        this.startedAt = startedAt;
        this.startedCommit = safe(() -> git.apply(List.of("rev-parse", "HEAD")));
    }

    public RuntimeVersion current(boolean refresh) {
        RuntimeVersion snapshot = cached;
        long now = System.currentTimeMillis();
        if (!refresh && snapshot != null && now - snapshot.checkedAt() < CACHE_MILLIS) return snapshot;
        RuntimeVersion next = inspect(now);
        cached = next;
        return next;
    }

    private RuntimeVersion inspect(long now) {
        if (startedCommit == null) {
            return new RuntimeVersion(null, startedAt, null, null, List.of(), now, "启动目录不是 Git 仓库，无法核对运行版本");
        }
        try {
            String head = git.apply(List.of("rev-parse", "HEAD"));
            if (head.equals(startedCommit)) return new RuntimeVersion(startedCommit, startedAt, head, 0, List.of(), now, null);
            int pending = Integer.parseInt(git.apply(List.of("rev-list", "--count", startedCommit + ".." + head)));
            String log = git.apply(List.of("log", "--format=%h %s", "-n", String.valueOf(MAX_PENDING_SUBJECTS), startedCommit + ".." + head));
            List<String> subjects = log.isBlank() ? List.of() : Arrays.asList(log.split("\\R"));
            return new RuntimeVersion(startedCommit, startedAt, head, pending, subjects, now, null);
        } catch (RuntimeException e) {
            return new RuntimeVersion(startedCommit, startedAt, null, null, List.of(), now, "当前源码版本读取失败：" + e.getMessage());
        }
    }

    private static String safe(java.util.function.Supplier<String> supplier) {
        try {
            String value = supplier.get();
            return value == null || value.isBlank() ? null : value;
        } catch (RuntimeException e) {
            log.info("[claude-chat] 未能记录启动源码版本：{}", e.getMessage());
            return null;
        }
    }

    private static String runGit(Path directory, List<String> args) {
        List<String> command = new java.util.ArrayList<>(List.of("git", "-c", "core.fsmonitor=false"));
        command.addAll(args);
        try {
            Process process = new ProcessBuilder(command).directory(directory.toFile()).redirectErrorStream(true).start();
            if (!process.waitFor(5, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new IllegalStateException("git 超时");
            }
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            if (process.exitValue() != 0) throw new IllegalStateException(output.isBlank() ? "git 退出码 " + process.exitValue() : output);
            return output;
        } catch (IOException e) {
            throw new IllegalStateException("无法执行 git：" + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("git 被中断", e);
        }
    }
}
