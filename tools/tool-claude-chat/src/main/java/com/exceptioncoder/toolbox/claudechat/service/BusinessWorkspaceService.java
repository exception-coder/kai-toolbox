package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.BusinessRepositoryStatusView;
import com.exceptioncoder.toolbox.claudechat.api.dto.BusinessSystemWorkspaceView;
import com.exceptioncoder.toolbox.claudechat.config.BusinessWorkspaceProperties;
import com.exceptioncoder.toolbox.claudechat.service.BusinessWorkspaceCatalog.RepositoryDefinition;
import com.exceptioncoder.toolbox.claudechat.service.BusinessWorkspaceCatalog.SystemDefinition;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** 固定业务仓库的只拉取同步服务，不提供提交、推送、重置、删除或切换远端能力。 */
@Slf4j
@Service
public class BusinessWorkspaceService {

    private static final long STATUS_TIMEOUT_MS = 10_000L;
    private static final int MAX_OUTPUT_LENGTH = 800;

    private final BusinessWorkspaceProperties properties;
    private final BusinessWorkspaceCatalog catalog;
    private final SseEmitterRegistry sse;

    public BusinessWorkspaceService(BusinessWorkspaceProperties properties,
                                    BusinessWorkspaceCatalog catalog,
                                    SseEmitterRegistry sse) {
        this.properties = properties;
        this.catalog = catalog;
        this.sse = sse;
    }

    public List<BusinessSystemWorkspaceView> readStatuses(boolean fetch) {
        Path root = properties.resolveRoot();
        return catalog.systems().stream()
                .map(system -> inspectSystem(root, system, fetch))
                .toList();
    }

    public void startSync(String taskId, String requestedSystem) {
        Thread.ofVirtual().name("business-workspace-sync-" + taskId).start(() -> {
            List<Map<String, Object>> results = new ArrayList<>();
            try {
                Thread.sleep(150);
                List<SystemDefinition> systems = selectedSystems(requestedSystem);
                Path root = properties.resolveRoot();
                Files.createDirectories(root);
                publishLine(taskId, "业务源码目录：" + root);
                for (SystemDefinition system : systems) {
                    publishLine(taskId, system.name() + "：开始同步");
                    for (RepositoryDefinition repository : system.repositories()) {
                        results.add(syncRepository(taskId, root, system, repository));
                    }
                }
                sse.publish(taskId, "message", Map.of("type", "done", "results", results));
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                sse.publish(taskId, "message", Map.of("type", "error", "message", "业务源码同步被中断"));
            } catch (Exception exception) {
                log.warn("业务源码同步失败", exception);
                sse.publish(taskId, "message", Map.of(
                        "type", "error", "message", safeMessage(exception.getMessage())));
            } finally {
                sse.complete(taskId);
            }
        });
    }

    private List<SystemDefinition> selectedSystems(String requestedSystem) {
        String normalized = requestedSystem == null ? "all" : requestedSystem.trim().toLowerCase(Locale.ROOT);
        return normalized.isBlank() || normalized.equals("all")
                ? catalog.systems()
                : List.of(catalog.requireSystem(normalized));
    }

    private BusinessSystemWorkspaceView inspectSystem(Path root, SystemDefinition system, boolean fetch) {
        List<BusinessRepositoryStatusView> members = system.repositories().stream()
                .map(repository -> inspectRepository(root, repository, fetch))
                .toList();
        long readyCount = members.stream().filter(member -> member.status().equals("READY")).count();
        long presentCount = members.stream().filter(BusinessRepositoryStatusView::cloned).count();
        boolean ready = readyCount == members.size();
        String status;
        if (ready) {
            status = "READY";
        } else if (presentCount == 0) {
            status = "NOT_CLONED";
        } else if (members.stream().anyMatch(BusinessRepositoryStatusView::syncable)) {
            status = "PARTIAL";
        } else {
            status = "BLOCKED";
        }
        String message = ready
                ? members.size() + " 个仓库已就绪"
                : presentCount + "/" + members.size() + " 个仓库已拉取";
        Path workspace = root.resolve(system.workspaceName()).normalize();
        return new BusinessSystemWorkspaceView(
                system.id(), system.name(), system.workspaceName(), workspace.toString(),
                ready, status, message, members);
    }

    private BusinessRepositoryStatusView inspectRepository(
            Path root, RepositoryDefinition repository, boolean fetch) {
        Path target = resolveTarget(root, repository);
        if (!Files.exists(target)) {
            return view(repository, target, false, false, null, null, null,
                    null, null, false, false, true, "NOT_CLONED", "未拉取");
        }
        if (!Files.isDirectory(target) || !Files.exists(target.resolve(".git"))) {
            return view(repository, target, false, false, null, null, null,
                    null, null, false, false, false, "INVALID_DIRECTORY", "目标已存在但不是 Git 仓库");
        }

        String remote = gitOutput(target, STATUS_TIMEOUT_MS, "remote", "get-url", "origin");
        boolean sourceMatches = sameGitRemote(remote, repository.repositoryUrl());
        String branch = nullIfBlank(gitOutput(target, STATUS_TIMEOUT_MS, "branch", "--show-current"));
        String commit = nullIfBlank(gitOutput(target, STATUS_TIMEOUT_MS, "rev-parse", "--short", "HEAD"));
        String commitDate = nullIfBlank(gitOutput(target, STATUS_TIMEOUT_MS, "log", "-1", "--format=%cs"));
        boolean dirty = !gitOutput(target, STATUS_TIMEOUT_MS, "status", "--porcelain").isBlank();
        boolean remoteChecked = false;
        String fetchError = null;
        if (fetch && sourceMatches) {
            long fetchTimeout = properties.getCommandTimeoutMs() <= 0
                    ? 120_000L
                    : Math.min(properties.getCommandTimeoutMs(), 120_000L);
            CommandResult result = runGit(target, fetchTimeout,
                    List.of("fetch", "--quiet", "--prune", "origin"), null);
            remoteChecked = result.ok();
            if (!result.ok()) {
                fetchError = "远端检查失败：" + compactOutput(result.output());
            }
        }

        String upstream = nullIfBlank(gitOutput(target, STATUS_TIMEOUT_MS,
                "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"));
        Integer behind = upstream == null ? null
                : parseCount(gitOutput(target, STATUS_TIMEOUT_MS, "rev-list", "--count", "HEAD..@{u}"));
        Integer ahead = upstream == null ? null
                : parseCount(gitOutput(target, STATUS_TIMEOUT_MS, "rev-list", "--count", "@{u}..HEAD"));

        RepositoryState state = classify(sourceMatches, dirty, branch, upstream, ahead, behind, fetchError);
        return view(repository, target, true, sourceMatches, branch, commit, commitDate,
                behind, ahead, dirty, remoteChecked, state.syncable(), state.status(), state.message());
    }

    static RepositoryState classify(boolean sourceMatches, boolean dirty, String branch, String upstream,
                                    Integer ahead, Integer behind, String fetchError) {
        if (!sourceMatches) {
            return new RepositoryState(false, "REMOTE_MISMATCH", "origin 与固定 Gitee 地址不一致");
        }
        if (fetchError != null) {
            return new RepositoryState(false, "ERROR", fetchError);
        }
        if (dirty) {
            return new RepositoryState(false, "DIRTY", "有未提交修改，已保护");
        }
        if (branch == null || branch.isBlank()) {
            return new RepositoryState(false, "DETACHED_HEAD", "当前处于 detached HEAD");
        }
        if (upstream == null || ahead == null || behind == null) {
            return new RepositoryState(false, "NO_UPSTREAM", "当前分支没有可确认的上游");
        }
        if (ahead > 0 && behind > 0) {
            return new RepositoryState(false, "DIVERGED", "本地与远端已分叉");
        }
        if (ahead > 0) {
            return new RepositoryState(false, "AHEAD", "本地领先 " + ahead + " 个提交");
        }
        if (behind > 0) {
            return new RepositoryState(true, "BEHIND", "落后 " + behind + " 个提交");
        }
        return new RepositoryState(true, "READY", "已是最新");
    }

    private Map<String, Object> syncRepository(String taskId, Path root, SystemDefinition system,
                                               RepositoryDefinition repository) {
        Path target = resolveTarget(root, repository);
        publishLine(taskId, system.name() + " / " + repository.name() + "：检查本地状态");
        if (!Files.exists(target)) {
            try {
                Files.createDirectories(target.getParent());
            } catch (IOException exception) {
                return result(system, repository, false, "failed",
                        "无法创建目标父目录：" + safeMessage(exception.getMessage()));
            }
            CommandResult clone = runGit(target.getParent(), properties.getCommandTimeoutMs(),
                    List.of("clone", "--progress", repository.repositoryUrl(), target.toString()),
                    line -> publishLine(taskId, repository.name() + "：" + line));
            publishStep(taskId, "clone:" + repository.name(), clone.exitCode());
            return result(system, repository, clone.ok(), clone.ok() ? "cloned" : "failed",
                    clone.ok() ? "克隆完成" : compactOutput(clone.output()));
        }

        BusinessRepositoryStatusView before = inspectRepository(root, repository, false);
        if (!before.cloned() || !before.sourceMatches() || before.dirty()) {
            publishLine(taskId, repository.name() + "：跳过，" + before.message());
            return result(system, repository, false, "skipped", before.message());
        }

        CommandResult fetch = runGit(target, properties.getCommandTimeoutMs(),
                List.of("fetch", "--prune", "origin"),
                line -> publishLine(taskId, repository.name() + "：" + line));
        publishStep(taskId, "fetch:" + repository.name(), fetch.exitCode());
        if (!fetch.ok()) {
            return result(system, repository, false, "failed", compactOutput(fetch.output()));
        }

        BusinessRepositoryStatusView refreshed = inspectRepository(root, repository, false);
        if (!refreshed.syncable()) {
            publishLine(taskId, repository.name() + "：跳过，" + refreshed.message());
            return result(system, repository, false, "skipped", refreshed.message());
        }
        if (refreshed.behind() == null || refreshed.behind() == 0) {
            publishLine(taskId, repository.name() + "：已是最新");
            return result(system, repository, true, "unchanged", "已是最新");
        }

        CommandResult pull = runGit(target, properties.getCommandTimeoutMs(),
                List.of("pull", "--ff-only"),
                line -> publishLine(taskId, repository.name() + "：" + line));
        publishStep(taskId, "pull:" + repository.name(), pull.exitCode());
        return result(system, repository, pull.ok(), pull.ok() ? "pulled" : "failed",
                pull.ok() ? "快进更新完成" : compactOutput(pull.output()));
    }

    private Map<String, Object> result(SystemDefinition system, RepositoryDefinition repository,
                                       boolean ok, String action, String message) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("system", system.id());
        result.put("repository", repository.name());
        result.put("ok", ok);
        result.put("action", action);
        result.put("message", safeMessage(message));
        return result;
    }

    private BusinessRepositoryStatusView view(
            RepositoryDefinition repository, Path target, boolean cloned, boolean sourceMatches,
            String branch, String commit, String commitDate, Integer behind, Integer ahead,
            boolean dirty, boolean remoteChecked, boolean syncable, String status, String message) {
        return new BusinessRepositoryStatusView(
                repository.name(), target.toString(), repository.repositoryUrl(), cloned, sourceMatches,
                branch, commit, commitDate, behind, ahead, dirty, remoteChecked, syncable, status, message);
    }

    private Path resolveTarget(Path root, RepositoryDefinition repository) {
        Path safeRoot = root.toAbsolutePath().normalize();
        Path target = safeRoot.resolve(repository.relativePath()).normalize();
        if (target.equals(safeRoot) || !target.startsWith(safeRoot)) {
            throw new IllegalStateException("业务仓库目标越界：" + target);
        }
        return target;
    }

    private String gitOutput(Path directory, long timeoutMs, String... arguments) {
        CommandResult result = runGit(directory, timeoutMs, List.of(arguments), null);
        return result.ok() ? result.output().trim() : "";
    }

    private CommandResult runGit(Path directory, long timeoutMs, List<String> arguments,
                                 Consumer<String> lineConsumer) {
        List<String> command = new ArrayList<>(arguments.size() + 1);
        command.add("git");
        command.addAll(arguments);
        ProcessBuilder builder = new ProcessBuilder(command).directory(directory.toFile()).redirectErrorStream(true);
        builder.environment().put("GIT_TERMINAL_PROMPT", "0");
        builder.environment().put("GCM_INTERACTIVE", "never");
        StringBuilder output = new StringBuilder();
        try {
            Process process = builder.start();
            Thread reader = Thread.ofVirtual().name("business-git-output").start(() -> {
                try (BufferedReader stream = new BufferedReader(
                        new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = stream.readLine()) != null) {
                        String safeLine = safeMessage(line);
                        output.append(safeLine).append('\n');
                        if (lineConsumer != null && !safeLine.isBlank()) {
                            lineConsumer.accept(safeLine);
                        }
                    }
                } catch (IOException exception) {
                    log.debug("读取业务仓库 Git 输出失败：{}", exception.getMessage());
                }
            });
            long effectiveTimeout = timeoutMs <= 0 ? 600_000L : timeoutMs;
            boolean completed = process.waitFor(effectiveTimeout, TimeUnit.MILLISECONDS);
            if (!completed) {
                process.destroyForcibly();
                reader.join(2_000L);
                return new CommandResult(-1, output + "命令执行超时");
            }
            reader.join(2_000L);
            return new CommandResult(process.exitValue(), output.toString());
        } catch (IOException exception) {
            return new CommandResult(-1, "Git 命令启动失败：" + safeMessage(exception.getMessage()));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return new CommandResult(-1, "Git 命令被中断");
        }
    }

    private void publishLine(String taskId, String text) {
        sse.publish(taskId, "message", Map.of("type", "line", "engine", "git", "text", safeMessage(text)));
    }

    private void publishStep(String taskId, String step, int exitCode) {
        sse.publish(taskId, "message", Map.of(
                "type", "step", "engine", "git", "step", step, "exitCode", exitCode));
    }

    static boolean sameGitRemote(String actual, String expected) {
        return normalizeGitRemote(actual).equals(normalizeGitRemote(expected));
    }

    private static String normalizeGitRemote(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().replace('\\', '/').replaceAll("/+$", "")
                .replaceAll("(?i)\\.git$", "").toLowerCase(Locale.ROOT);
    }

    private static Integer parseCount(String value) {
        try {
            return value == null || value.isBlank() ? null : Integer.parseInt(value.trim());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static String nullIfBlank(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String compactOutput(String output) {
        String compact = sanitize(output).replaceAll("\\s+", " ").trim();
        if (compact.isBlank()) {
            return "Git 命令执行失败，无输出";
        }
        return compact.length() <= MAX_OUTPUT_LENGTH
                ? compact
                : compact.substring(compact.length() - MAX_OUTPUT_LENGTH);
    }

    private static String safeMessage(String value) {
        if (value == null || value.isBlank()) {
            return "未知错误";
        }
        return sanitize(value);
    }

    private static String sanitize(String value) {
        return value == null ? "" : value.replaceAll("(?i)(https?://)[^\\s/@]+@", "$1");
    }

    record RepositoryState(boolean syncable, String status, String message) {
    }

    private record CommandResult(int exitCode, String output) {
        boolean ok() {
            return exitCode == 0;
        }
    }
}
