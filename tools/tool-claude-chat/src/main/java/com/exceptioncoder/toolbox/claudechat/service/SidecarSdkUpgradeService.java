package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** 管理员触发的 SDK 升级编排；隔离准备，空闲提升，失败恢复。 */
@Slf4j
@Service
public class SidecarSdkUpgradeService {
    private static final Duration COMMAND_TIMEOUT = Duration.ofMinutes(8);
    private final SidecarVersionService versions;
    private final SidecarProcessRegistry registry;
    private final SidecarClient client;
    private final ClaudeChatService chat;
    private final ClaudeChatProperties properties;
    private final ObjectMapper mapper;
    private volatile UpgradeStatus status = new UpgradeStatus(false, "IDLE", null, "尚未升级", null);

    public SidecarSdkUpgradeService(SidecarVersionService versions, SidecarProcessRegistry registry,
                                   SidecarClient client, ClaudeChatService chat,
                                   ClaudeChatProperties properties, ObjectMapper mapper) {
        this.versions = versions;
        this.registry = registry;
        this.client = client;
        this.chat = chat;
        this.properties = properties;
        this.mapper = mapper;
    }

    /** 升级过程可跨浏览器刷新查询；当前任务只在本 JVM 保留。 */
    public UpgradeStatus status() { return status; }

    /** 受控入口不接收命令、路径或任意 npm spec。 */
    public synchronized UpgradeStatus start(String engine) {
        if (AuthContext.current().filter(principal -> principal.hasAnyRole("ADMIN")).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "仅管理员可升级 SDK");
        }
        if (engine == null || SidecarVersionService.upgradePackage(engine) == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "该引擎不支持内置 SDK 升级");
        }
        if (status.running()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "已有 SDK 升级任务，请等待完成");
        }
        if (!chat.activitySnapshot().safeToRestart()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "仍有运行、未决或状态不确定的会话，请完成后重试");
        }
        status = new UpgradeStatus(true, "CHECKING", engine, "正在检查最新稳定版本", null);
        Thread.ofVirtual().name("sidecar-sdk-upgrade").start(() -> upgrade(engine));
        return status;
    }

    private void upgrade(String engine) {
        SidecarSdkUpgradeWorkspace workspace = null;
        try {
            var version = versions.read(true).engines().stream()
                    .filter(item -> engine.equals(item.id())).findFirst().orElseThrow();
            String latest = version.latest();
            if (latest == null || !latest.matches("[0-9]+\\.[0-9]+\\.[0-9]+")) {
                throw new IOException("无法取得最新稳定版本，请检查 npm 网络后重试");
            }
            if (latest.equals(version.installed())) {
                update(false, "SUCCEEDED", "当前 SDK 已是最新版本 " + latest, null);
                return;
            }
            if (version.installed() != null && version.installed().matches("[0-9]+\\.[0-9]+\\.[0-9]+")
                    && compareStableVersions(version.installed(), latest) > 0) {
                update(false, "SUCCEEDED", "当前 SDK " + version.installed() + " 高于稳定版，未执行降级", null);
                return;
            }
            workspace = new SidecarSdkUpgradeWorkspace(registry.sidecarDir());
            update(true, "INSTALLING", "正在隔离安装 " + version.name() + " " + latest, workspace);
            prepare(workspace, SidecarVersionService.upgradePackage(engine) + "@" + latest);
            update(true, "ACTIVATING", "正在检查会话并切换运行时", workspace);
            activate(workspace);
            update(false, "SUCCEEDED", version.name() + " 已升级到 " + latest + "，会话已重新连接", workspace);
        } catch (Exception e) {
            log.error("[claude-chat] SDK 升级失败 engine={}", engine, e);
            update(false, "FAILED", e.getMessage() == null ? "升级失败，请查看诊断日志" : e.getMessage(), workspace);
        }
    }

    private void prepare(SidecarSdkUpgradeWorkspace workspace, String dependency) throws Exception {
        List<String> install = new ArrayList<>();
        if (System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
            install.addAll(List.of("cmd.exe", "/d", "/c", "npm.cmd"));
        } else {
            install.add("npm");
        }
        install.addAll(List.of("install", "--ignore-scripts", "--save-exact", "--no-audit", "--no-fund", dependency));
        run(workspace, install);
        update(true, "VERIFYING", "正在校验 Codex 协议与 TypeScript 编译", workspace);
        run(workspace, List.of(properties.getNodeCommand(), "scripts/check-codex-app-server-schema.mjs"));
        run(workspace, List.of(properties.getNodeCommand(), "node_modules/typescript/bin/tsc",
                "--project", "tsconfig.json", "--outDir", "dist"));
        for (String artifact : List.of("server.js", "toolboxMcpBridge.js")) {
            if (!Files.isRegularFile(workspace.stage().resolve("dist").resolve(artifact))) {
                throw new IOException("构建产物不完整：" + artifact);
            }
        }
        mapper.writeValue(workspace.stage().resolve("dist/build-manifest.json").toFile(),
                Map.of("buildId", "sdk-" + System.currentTimeMillis(), "builtAt", Instant.now().toString()));
    }

    /** 发送栅栏先于活动检查设置，覆盖最后一刻的新任务；启动栅栏阻止后台重连。 */
    void activate(SidecarSdkUpgradeWorkspace workspace) throws Exception {
        client.beginSdkMaintenance();
        registry.beginSdkMaintenance();
        boolean stopped = false;
        try {
            if (!chat.activitySnapshot().safeToRestart()) {
                throw new IOException("准备期间出现活动会话，已保留旧 SDK；请会话结束后重试");
            }
            workspace.assertUnchanged();
            client.disconnectForSdkUpgrade();
            stopped = true;
            registry.stopForSdkUpgrade();
            workspace.promote();
            reconnect();
        } catch (Exception activationError) {
            if (stopped) {
                try {
                    client.disconnectForSdkUpgrade();
                    registry.beginSdkMaintenance();
                    registry.stopForSdkUpgrade();
                    workspace.rollback();
                    reconnect();
                } catch (Exception recoveryError) {
                    activationError.addSuppressed(recoveryError);
                    throw new IOException("升级失败且自动恢复未完成，备份位于 " + workspace.backup(), activationError);
                }
                throw new IOException("升级失败，已恢复原版本：" + activationError.getMessage(), activationError);
            }
            throw activationError;
        } finally {
            registry.endSdkMaintenance();
            client.endSdkMaintenance();
            if (stopped && client.isConnected()) {
                chat.resumeAllSessions();
            }
        }
    }

    private void reconnect() throws IOException {
        registry.endSdkMaintenance();
        registry.ensureStarted();
        client.ensureConnected();
    }

    /** 输出直接写文件，防止子进程管道填满；超时终止子进程树。 */
    private void run(SidecarSdkUpgradeWorkspace workspace, List<String> command) throws Exception {
        Process process = new ProcessBuilder(command).directory(workspace.stage().toFile())
                .redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.appendTo(workspace.logFile().toFile()))
                .start();
        try {
            if (!process.waitFor(COMMAND_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)) {
                throw new IOException("升级命令超时，请查看诊断日志");
            }
            if (process.exitValue() != 0) {
                throw new IOException("安装或验证失败（退出码 " + process.exitValue() + "），请查看诊断日志后重试");
            }
        } finally {
            if (process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
                process.waitFor(5, TimeUnit.SECONDS);
            }
        }
    }

    private void update(boolean running, String phase, String message, SidecarSdkUpgradeWorkspace workspace) {
        status = new UpgradeStatus(running, phase, status.engine(), message,
                workspace == null ? null : workspace.logFile().toString());
    }

    static int compareStableVersions(String left, String right) {
        String[] current = left.split("\\.");
        String[] target = right.split("\\.");
        for (int index = 0; index < 3; index++) {
            int compared = new java.math.BigInteger(current[index]).compareTo(new java.math.BigInteger(target[index]));
            if (compared != 0) return compared;
        }
        return 0;
    }

    /** @param running 是否执行中 @param phase 阶段 @param engine 引擎 @param message 结果说明 @param logPath 本地日志 */
    public record UpgradeStatus(boolean running, String phase, String engine, String message, String logPath) { }
}
