package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ForgeEnvironmentView;
import com.exceptioncoder.toolbox.claudechat.api.dto.ForgeEnvironmentView.DependencyView;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/** 用户授权后按依赖拓扑补齐 Forge 环境，并推送可恢复的步骤状态。 */
@Service("claudeChatForgeEnvironmentBootstrapService")
public class ForgeEnvironmentBootstrapService {

    private static final Duration INSTALL_TIMEOUT = Duration.ofMinutes(10);
    private static final List<String> TOOL_ORDER = List.of(
            "git", "node", "uv", "python", "claude", "codex", "graphify", "openspec");

    private final ForgeEnvironmentService environmentService;
    private final ForgeEnvironmentCommandRunner commandRunner;
    private final PluginUpdateService pluginUpdateService;
    private final SseEmitterRegistry sse;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public ForgeEnvironmentBootstrapService(ForgeEnvironmentService environmentService,
                                            ForgeEnvironmentCommandRunner commandRunner,
                                            PluginUpdateService pluginUpdateService,
                                            SseEmitterRegistry sse) {
        this.environmentService = environmentService;
        this.commandRunner = commandRunner;
        this.pluginUpdateService = pluginUpdateService;
        this.sse = sse;
    }

    /**
     * 启动唯一初始化任务；重复请求在自己的 SSE 中返回冲突状态。
     *
     * @param taskId SSE 任务 ID
     * @param sessionId 可选 Codex 会话上下文
     * @param source 公司依赖 Git 源
     */
    public void start(String taskId, String sessionId, String source) {
        Thread.ofVirtual().name("forge-environment-bootstrap-" + taskId).start(() -> {
            if (!running.compareAndSet(false, true)) {
                publish("error", Map.of("message", "已有 Forge 环境初始化任务正在运行"), taskId);
                sse.complete(taskId);
                return;
            }
            try {
                Thread.sleep(150L);
                runBootstrap(taskId, sessionId, source);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                publish("error", Map.of("message", "Forge 环境初始化被中断"), taskId);
            } catch (Exception exception) {
                publish("error", Map.of("message", safeMessage(exception)), taskId);
            } finally {
                running.set(false);
                sse.complete(taskId);
            }
        });
    }

    /** 执行固定初始化步骤，包级可见用于确定性测试。 */
    BootstrapResult runBootstrap(String taskId, String sessionId, String source) {
        ForgeEnvironmentView before = environmentService.inspect(sessionId, source, false);
        publish("snapshot", before, taskId);
        List<String> completed = new ArrayList<>();
        for (String toolId : TOOL_ORDER) {
            ToolOutcome outcome = ensureTool(taskId, toolId);
            if (outcome == ToolOutcome.FAILED) {
                publish("error", Map.of("stepId", toolId, "message", "依赖安装失败，请按诊断恢复后重试"), taskId);
                return new BootstrapResult(false, false, completed);
            }
            if (outcome == ToolOutcome.RESTART_REQUIRED) {
                publish("restartRequired", Map.of(
                        "message", "基础工具已安装，请重启 Forge 后继续初始化",
                        "completed", List.copyOf(completed)), taskId);
                return new BootstrapResult(false, true, completed);
            }
            completed.add(toolId);
        }

        publishStep(taskId, "team-suites", "公司套件", "RUNNING", "正在拉取并安装公司插件与 MCP", null);
        List<Map<String, Object>> suiteResults = pluginUpdateService.installDependencies(taskId, sessionId, source);
        boolean suitesReady = suiteResults.stream().allMatch(PluginUpdateService::stepSucceeded);
        publishStep(taskId, "team-suites", "公司套件", suitesReady ? "SUCCEEDED" : "FAILED",
                suitesReady ? "公司套件安装完成" : "部分公司套件步骤未完成", null);
        ForgeEnvironmentView after = environmentService.inspect(sessionId, source, false);
        publish("snapshot", after, taskId);
        publish("done", Map.of("ready", after.ready(), "message",
                after.ready() ? "Forge 研发环境已就绪" : "初始化结束，仍有依赖需要处理"), taskId);
        return new BootstrapResult(after.ready(), false, completed);
    }

    private ToolOutcome ensureTool(String taskId, String toolId) {
        DependencyView current = environmentService.inspectTool(toolId);
        if ("READY".equals(current.state())) {
            publishStep(taskId, toolId, current.name(), "SKIPPED", "已就绪，无需重复安装", current.version());
            return ToolOutcome.READY;
        }
        List<String> command = environmentService.installCommand(toolId);
        if (command.isEmpty()) {
            publishStep(taskId, toolId, current.name(), "FAILED", "当前平台不支持自动安装",
                    current.installCommand());
            return ToolOutcome.FAILED;
        }
        publishStep(taskId, toolId, current.name(), "RUNNING", "正在执行固定安装命令",
                "$ " + String.join(" ", command));
        ForgeEnvironmentCommandRunner.CommandResult result = commandRunner.run(command, INSTALL_TIMEOUT, null,
                line -> publish("message", Map.of("type", "line", "engine", toolId, "text", line), taskId));
        if (!result.succeeded()) {
            publishStep(taskId, toolId, current.name(), "FAILED", "安装命令执行失败", result.output());
            return ToolOutcome.FAILED;
        }
        commandRunner.refreshEnvironmentPath();
        DependencyView refreshed = environmentService.inspectTool(toolId);
        if (!"READY".equals(refreshed.state())) {
            publishStep(taskId, toolId, current.name(), "SUCCEEDED", "安装已完成，等待进程刷新 PATH", result.output());
            return ToolOutcome.RESTART_REQUIRED;
        }
        publishStep(taskId, toolId, current.name(), "SUCCEEDED", "安装并复检通过", refreshed.version());
        return ToolOutcome.READY;
    }

    private void publishStep(String taskId, String id, String name, String state, String message, String detail) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", id);
        payload.put("name", name);
        payload.put("state", state);
        payload.put("message", message);
        if (detail != null && !detail.isBlank()) {
            payload.put("detail", detail);
        }
        publish("step", payload, taskId);
    }

    private void publish(String event, Object payload, String taskId) {
        sse.publish(taskId, event, payload);
    }

    private static String safeMessage(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "Forge 环境初始化失败" : message;
    }

    private enum ToolOutcome {
        READY,
        RESTART_REQUIRED,
        FAILED
    }

    /**
     * @param ready 初始化结束后是否完整就绪
     * @param restartRequired 是否需要重启 Forge 继续
     * @param completed 已完成工具 ID
     */
    record BootstrapResult(boolean ready, boolean restartRequired, List<String> completed) {
    }
}
