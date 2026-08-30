package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.BusinessOpenSpecStatusView;
import com.exceptioncoder.toolbox.claudechat.config.BusinessWorkspaceProperties;
import com.exceptioncoder.toolbox.claudechat.service.BusinessWorkspaceCatalog.RepositoryDefinition;
import com.exceptioncoder.toolbox.claudechat.service.BusinessWorkspaceCatalog.SystemDefinition;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Stream;

/** 检查并初始化固定业务仓库的 OpenSpec Claude/Codex 双端能力。 */
@Slf4j
@Service
public class BusinessOpenSpecService {

    private static final String OPEN_SPEC_SKILL_PREFIX = "openspec-";
    private static final Duration STATUS_TIMEOUT = Duration.ofSeconds(10);

    private final BusinessWorkspaceProperties properties;
    private final BusinessWorkspaceCatalog catalog;
    private final ForgeEnvironmentCommandRunner commandRunner;
    private final SseEmitterRegistry sse;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public BusinessOpenSpecService(BusinessWorkspaceProperties properties,
                                   BusinessWorkspaceCatalog catalog,
                                   ForgeEnvironmentCommandRunner commandRunner,
                                   SseEmitterRegistry sse) {
        this.properties = properties;
        this.catalog = catalog;
        this.commandRunner = commandRunner;
        this.sse = sse;
    }

    /** 读取一个仓库内由 OpenSpec 管理的配置根与双端 Skill 证据。 */
    public BusinessOpenSpecStatusView inspect(Path repository) {
        if (!Files.isDirectory(repository) || !Files.exists(repository.resolve(".git"))) {
            return status(false, false, false, "NOT_AVAILABLE", "仓库尚未就绪");
        }
        boolean initialized = Files.isRegularFile(repository.resolve("openspec").resolve("config.yaml"));
        boolean claudeConfigured = containsManagedSkill(repository.resolve(".claude").resolve("skills"));
        boolean codexConfigured = containsManagedSkill(repository.resolve(".agents").resolve("skills"));
        if (initialized && claudeConfigured && codexConfigured) {
            return status(true, true, true, "READY", "Claude 与 Codex 已初始化");
        }
        if (initialized || claudeConfigured || codexConfigured) {
            return status(initialized, claudeConfigured, codexConfigured, "PARTIAL", missingMessage(
                    initialized, claudeConfigured, codexConfigured));
        }
        return status(false, false, false, "MISSING", "尚未初始化 OpenSpec");
    }

    /** 在虚拟线程中初始化固定业务仓库，并通过 SSE 返回逐仓库结果。 */
    public void startInitialization(String taskId, String requestedSystem) {
        Thread.ofVirtual().name("business-openspec-init-" + taskId).start(() -> initialize(taskId, requestedSystem));
    }

    private void initialize(String taskId, String requestedSystem) {
        if (!running.compareAndSet(false, true)) {
            sse.publish(taskId, "message", Map.of("type", "error", "message", "已有 OpenSpec 初始化任务正在执行"));
            sse.complete(taskId);
            return;
        }
        List<Map<String, Object>> results = new ArrayList<>();
        try {
            commandRunner.refreshEnvironmentPath();
            ForgeEnvironmentCommandRunner.CommandResult cli = commandRunner.run(
                    List.of("openspec", "--version"), STATUS_TIMEOUT, null, null);
            if (!cli.succeeded()) {
                throw new IllegalStateException("OpenSpec CLI 不可用，请先在 Forge 环境中完成安装");
            }
            for (SystemDefinition system : selectedSystems(requestedSystem)) {
                for (RepositoryDefinition repository : system.repositories()) {
                    results.add(initializeRepository(taskId, system, repository));
                }
            }
            sse.publish(taskId, "message", Map.of("type", "done", "results", results));
        } catch (Exception exception) {
            log.warn("业务仓库 OpenSpec 初始化失败", exception);
            sse.publish(taskId, "message", Map.of("type", "error", "message", safeMessage(exception.getMessage())));
        } finally {
            running.set(false);
            sse.complete(taskId);
        }
    }

    private Map<String, Object> initializeRepository(String taskId, SystemDefinition system,
                                                     RepositoryDefinition repository) {
        Path target = resolveTarget(repository);
        BusinessOpenSpecStatusView before = inspect(target);
        if ("NOT_AVAILABLE".equals(before.status())) {
            return result(system, repository, false, "skipped", "仓库尚未拉取或目录无效");
        }
        if ("READY".equals(before.status())) {
            return result(system, repository, true, "unchanged", "OpenSpec 双端能力已就绪");
        }

        ForgeEnvironmentCommandRunner.CommandResult remote = commandRunner.run(
                List.of("git", "remote", "get-url", "origin"), STATUS_TIMEOUT, target, null);
        if (!remote.succeeded() || !BusinessWorkspaceService.sameGitRemote(
                remote.output(), repository.repositoryUrl())) {
            return result(system, repository, false, "skipped", "origin 与固定 Gitee 地址不一致");
        }
        ForgeEnvironmentCommandRunner.CommandResult worktree = commandRunner.run(
                List.of("git", "status", "--porcelain"), STATUS_TIMEOUT, target, null);
        if (!worktree.succeeded() || !worktree.output().isBlank()) {
            return result(system, repository, false, "skipped", "工作树存在修改，已保护");
        }

        publishLine(taskId, system.name() + " / " + repository.name() + "：初始化 OpenSpec 双端能力");
        Duration timeout = Duration.ofMillis(Math.max(properties.getCommandTimeoutMs(), 60_000L));
        ForgeEnvironmentCommandRunner.CommandResult initialized = commandRunner.run(
                initializationCommand(),
                timeout, target, line -> publishLine(taskId, repository.name() + "：" + line));
        publishStep(taskId, repository.name(), initialized.exitCode());
        if (!initialized.succeeded()) {
            return result(system, repository, false, "failed", compact(initialized.output()));
        }
        BusinessOpenSpecStatusView after = inspect(target);
        return "READY".equals(after.status())
                ? result(system, repository, true, "initialized", "Claude 与 Codex 初始化完成")
                : result(system, repository, false, "failed", "命令完成但双端 Skill 证据不完整：" + after.message());
    }

    private List<SystemDefinition> selectedSystems(String requestedSystem) {
        String normalized = requestedSystem == null ? "all" : requestedSystem.trim().toLowerCase(Locale.ROOT);
        return normalized.isBlank() || "all".equals(normalized)
                ? catalog.systems()
                : List.of(catalog.requireSystem(normalized));
    }

    private Path resolveTarget(RepositoryDefinition repository) {
        Path root = properties.resolveRoot();
        Path target = root.resolve(repository.relativePath()).normalize();
        if (target.equals(root) || !target.startsWith(root)) {
            throw new IllegalStateException("业务仓库目标越界：" + target);
        }
        return target;
    }

    static boolean containsManagedSkill(Path skillsRoot) {
        if (!Files.isDirectory(skillsRoot)) {
            return false;
        }
        try (Stream<Path> children = Files.list(skillsRoot)) {
            return children.filter(Files::isDirectory)
                    .filter(path -> path.getFileName().toString().startsWith(OPEN_SPEC_SKILL_PREFIX))
                    .anyMatch(path -> Files.isRegularFile(path.resolve("SKILL.md")));
        } catch (IOException exception) {
            return false;
        }
    }

    static String missingMessage(boolean initialized, boolean claudeConfigured, boolean codexConfigured) {
        List<String> missing = new ArrayList<>();
        if (!initialized) {
            missing.add("配置根");
        }
        if (!claudeConfigured) {
            missing.add("Claude Skill");
        }
        if (!codexConfigured) {
            missing.add("Codex Skill");
        }
        return "缺少" + String.join("、", missing);
    }

    static List<String> initializationCommand() {
        return List.of("openspec", "init", ".", "--tools", "claude,codex", "--no-animation");
    }

    private static BusinessOpenSpecStatusView status(boolean initialized, boolean claudeConfigured,
                                                     boolean codexConfigured, String state, String message) {
        return new BusinessOpenSpecStatusView(initialized, claudeConfigured, codexConfigured, state, message);
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

    private void publishLine(String taskId, String text) {
        sse.publish(taskId, "message", Map.of("type", "line", "engine", "openspec", "text", safeMessage(text)));
    }

    private void publishStep(String taskId, String repository, int exitCode) {
        sse.publish(taskId, "message", Map.of(
                "type", "step", "engine", "openspec", "step", "init:" + repository, "exitCode", exitCode));
    }

    private static String compact(String output) {
        String value = safeMessage(output).replaceAll("\\s+", " ").trim();
        return value.length() <= 800 ? value : value.substring(value.length() - 800);
    }

    private static String safeMessage(String value) {
        if (value == null || value.isBlank()) {
            return "未知错误";
        }
        return value.replaceAll("(?i)(https?://)[^\\s/@]+@", "$1");
    }
}
