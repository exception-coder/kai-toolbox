package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** 手动和定时 SDK 升级共用一次隔离准备、空闲切换与失败恢复。 */
@Slf4j
@Service
public class SidecarSdkUpgradeService {
    private static final Duration COMMAND_TIMEOUT = Duration.ofMinutes(8);
    private static final Duration IDLE_WAIT = Duration.ofHours(1);
    private static final Duration OBSERVATION = Duration.ofSeconds(60);
    private final SidecarVersionService versions;
    private final SidecarProcessRegistry registry;
    private final SidecarClient client;
    private final ClaudeChatService chat;
    private final ClaudeChatProperties properties;
    private final ObjectMapper mapper;
    private final AgentWorkAdmissionGate admissionGate;
    private volatile UpgradeStatus status = new UpgradeStatus(false, "IDLE", null, "尚未升级", null);
    private Thread worker;
    private volatile boolean shuttingDown;

    public SidecarSdkUpgradeService(SidecarVersionService versions, SidecarProcessRegistry registry,
                                   SidecarClient client, ClaudeChatService chat,
                                   ClaudeChatProperties properties, ObjectMapper mapper,
                                   AgentWorkAdmissionGate admissionGate) {
        this.versions = versions;
        this.registry = registry;
        this.client = client;
        this.chat = chat;
        this.properties = properties;
        this.mapper = mapper;
        this.admissionGate = admissionGate;
    }

    /** 升级过程可跨浏览器刷新查询；当前任务只在本 JVM 保留。 */
    public UpgradeStatus status() { return status; }

    /** 受控入口不接收命令、路径或任意 npm spec。 */
    public synchronized UpgradeStatus start(String engine) {
        return start(engine == null ? List.of() : List.of(engine));
    }

    /** 多包共用一次隔离安装、验证和切换；任一非法输入拒绝整批。 */
    public synchronized UpgradeStatus start(List<String> engines) {
        if (AuthContext.current().filter(principal -> principal.hasAnyRole("ADMIN")).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "仅管理员可升级 SDK");
        }
        if (engines == null || engines.isEmpty() || engines.size() > SidecarVersionService.upgradeEngineIds().size()
                || engines.stream().anyMatch(engine -> engine == null || SidecarVersionService.upgradePackage(engine) == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "该引擎不支持内置 SDK 升级");
        }
        if ("RECOVERY_REQUIRED".equals(status.phase())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "上次升级恢复未完成，请先核对运行文件和备份");
        }
        if (shuttingDown || status.running()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "已有 SDK 升级任务，请等待完成");
        }
        if (!isIdle()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "仍有运行、未决或状态不确定的会话，请完成后重试");
        }
        return launch(engines.stream().distinct().toList(), false);
    }

    /** 默认关闭。设置 Cron 后，定时任务只处理现有固定 npm 白名单。 */
    @Scheduled(cron = "${toolbox.claude-chat.sdk-auto-upgrade.cron:${FORGE_SIDECAR_SDK_UPGRADE_CRON:-}}", zone = "Asia/Shanghai")
    synchronized void checkAutomatically() {
        if (canStart()) {
            launch(SidecarVersionService.upgradeEngineIds(), true);
        }
    }

    private boolean canStart() {
        return !shuttingDown && !status.running() && !"RECOVERY_REQUIRED".equals(status.phase());
    }

    private UpgradeStatus launch(List<String> selected, boolean automatic) {
        status = new UpgradeStatus(true, "CHECKING", String.join(",", selected), "正在检查所选 SDK 的最新稳定版本", null);
        worker = Thread.ofVirtual().name("sidecar-sdk-upgrade").unstarted(() -> upgrade(selected, automatic));
        worker.start();
        return status;
    }

    @PreDestroy
    void shutdown() {
        Thread current;
        synchronized (this) {
            shuttingDown = true;
            current = worker;
        }
        if (current != null && current.isAlive()) {
            current.interrupt();
            try {
                current.join(Duration.ofSeconds(15));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    void upgrade(List<String> engines) {
        upgrade(engines, false);
    }

    void upgrade(List<String> engines, boolean automatic) {
        SidecarSdkUpgradeWorkspace workspace = null;
        try {
            List<String> dependencies = dependencies(engines);
            if (dependencies.isEmpty()) {
                update(false, "SUCCEEDED", "所选 SDK 已是最新或更高稳定版本，无需切换运行时", null);
                return;
            }
            workspace = new SidecarSdkUpgradeWorkspace(registry.sidecarDir());
            update(true, "INSTALLING", "正在隔离安装 " + String.join("、", dependencies), workspace);
            prepare(workspace, dependencies);
            if (automatic) {
                awaitIdleAndActivate(workspace);
            } else {
                update(true, "ACTIVATING", "正在检查会话并切换运行时", workspace);
                activate(workspace);
            }
            update(false, "SUCCEEDED", "批量升级完成：" + String.join("、", dependencies) + "；其余所选 SDK 无需升级，会话已重新连接", workspace);
        } catch (UpgradeDeferred e) {
            log.info("[claude-chat] SDK 升级暂缓：{}", e.getMessage());
            update(false, "DEFERRED", e.getMessage(), workspace);
        } catch (Exception e) {
            log.error("[claude-chat] SDK 批量升级失败 engines={}", engines, e);
            update(false, e instanceof RecoveryRequired ? "RECOVERY_REQUIRED" : "FAILED",
                    e.getMessage() == null ? "升级失败，请查看诊断日志" : e.getMessage(), workspace);
        }
    }

    private boolean isIdle() {
        return chat.activitySnapshot().safeToRestart() && !chat.hasQueuedMessages();
    }

    private void awaitIdleAndActivate(SidecarSdkUpgradeWorkspace workspace) throws Exception {
        long deadline = System.nanoTime() + IDLE_WAIT.toNanos();
        while (System.nanoTime() < deadline) {
            if (isIdle() && !admissionGate.isDraining()) {
                try {
                    update(true, "ACTIVATING", "正在检查会话并切换运行时", workspace);
                    activate(workspace);
                    return;
                } catch (UpgradeDeferred e) {
                    // 准入锁取得前可能有新任务，旧进程仍在线，继续等待原候选。
                }
            }
            update(true, "WAITING_FOR_IDLE", "候选版本已验证，正在等待会话和后台任务结束", workspace);
            Thread.sleep(15_000);
        }
        throw new UpgradeDeferred("等待空闲超时，本批未切换，保留当前版本");
    }

    List<String> dependencies(List<String> engines) throws IOException {
        var available = versions.read(true).engines();
        List<String> dependencies = new ArrayList<>();
        for (String engine : engines.stream().distinct().toList()) {
            var version = available.stream().filter(item -> engine.equals(item.id())).findFirst()
                    .orElseThrow(() -> new IOException("未取得 SDK 版本：" + engine));
            String latest = version.latest();
            if (latest == null || !latest.matches("[0-9]+\\.[0-9]+\\.[0-9]+")) {
                throw new IOException(engine + " 无法取得最新稳定版本，整批未升级，请检查 npm 网络后重试");
            }
            if (version.installed() != null) {
                String core = version.installed().split("[-+]", 2)[0];
                if (core.matches("[0-9]+\\.[0-9]+\\.[0-9]+")) {
                    int compared = compareStableVersions(core, latest);
                    // 更高版本的预发布包也不能被旧稳定版覆盖；同版本预发布可升级为正式版。
                    if (compared > 0 || compared == 0 && !version.installed().split("\\+", 2)[0].contains("-")) {
                        continue;
                    }
                }
            }
            dependencies.add(SidecarVersionService.upgradePackage(engine) + "@" + latest);
        }
        return List.copyOf(dependencies);
    }

    void prepare(SidecarSdkUpgradeWorkspace workspace, List<String> dependencies) throws Exception {
        List<String> install = new ArrayList<>();
        if (System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
            install.addAll(List.of("cmd.exe", "/d", "/c", "npm.cmd"));
        } else {
            install.add("npm");
        }
        install.addAll(List.of("install", "--ignore-scripts", "--save-exact", "--no-audit", "--no-fund"));
        install.addAll(dependencies);
        run(workspace, install);
        for (String dependency : dependencies) {
            int separator = dependency.lastIndexOf('@');
            String name = dependency.substring(0, separator);
            String target = dependency.substring(separator + 1);
            var installed = workspace.stage().resolve("node_modules").resolve(name).resolve("package.json");
            if (!target.equals(mapper.readTree(installed.toFile()).path("version").asText())) {
                throw new IOException("候选 SDK 版本与升级目标不一致：" + name);
            }
        }
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
        try (var ignored = admissionGate.tryAcquireDrain()
                .orElseThrow(() -> new UpgradeDeferred("另一个更新流程正在切换运行时"))) {
            activateWhileDraining(workspace);
        }
    }

    private void activateWhileDraining(SidecarSdkUpgradeWorkspace workspace) throws Exception {
        client.beginSdkMaintenance();
        registry.beginSdkMaintenance();
        boolean disconnected = false;
        boolean promotionAttempted = false;
        try {
            if (!isIdle()) {
                throw new UpgradeDeferred("准备期间出现活动会话或待发送消息，已保留旧 SDK");
            }
            workspace.assertUnchanged();
            if (shuttingDown || Thread.currentThread().isInterrupted()) {
                throw new UpgradeDeferred("Forge 正在停止，本批未切换");
            }
            if (workspace.recoveryPending()) {
                throw new RecoveryRequired("上次 SDK 切换状态待核对，请检查 .sdk-upgrades/recovery-required", null);
            }
            client.disconnectForSdkUpgrade();
            disconnected = true;
            registry.stopForSdkUpgrade();
            workspace.markActivation();
            promotionAttempted = true;
            workspace.promote();
            reconnect();
            if (!chat.resumeAllSessions()) {
                throw new IOException("新版本部分会话状态尚未确认");
            }
            update(true, "OBSERVING", "新版本已连接，正在确认运行稳定性", workspace);
            observeRuntime();
            workspace.completeActivation();
        } catch (Exception activationError) {
            if (disconnected) {
                boolean interrupted = Thread.interrupted() || activationError instanceof InterruptedException;
                try {
                    if (promotionAttempted) {
                        client.disconnectForSdkUpgrade();
                        registry.beginSdkMaintenance();
                        registry.stopForSdkUpgrade();
                        workspace.rollback();
                    }
                    reconnect();
                    verifyRuntime(registry.runningProcess(), client.sdkConnectionId());
                    if (!chat.resumeAllSessions()) {
                        throw new IOException("旧版本部分会话状态尚未确认");
                    }
                    if (promotionAttempted) {
                        workspace.completeActivation();
                    }
                } catch (Exception recoveryError) {
                    activationError.addSuppressed(recoveryError);
                    client.blockSdkRecovery();
                    throw new RecoveryRequired("升级失败且自动恢复未完成，备份位于 " + workspace.backup(), activationError);
                } finally {
                    if (interrupted) {
                        Thread.currentThread().interrupt();
                    }
                }
                throw new IOException((promotionAttempted ? "升级失败，已恢复原版本：" : "未切换文件，旧版本已连接：")
                        + activationError.getMessage(), activationError);
            }
            throw activationError;
        } finally {
            registry.endSdkMaintenance();
            client.endSdkMaintenance();
        }
    }

    void observeRuntime() throws Exception {
        Process process = registry.runningProcess();
        String connection = client.sdkConnectionId();
        verifyRuntime(process, connection);
        long deadline = System.nanoTime() + OBSERVATION.toNanos();
        while (System.nanoTime() < deadline) {
            Thread.sleep(2_000);
            requireSameRuntime(process, connection);
        }
        verifyRuntime(process, connection);
    }

    private void verifyRuntime(Process process, String connection) throws IOException {
        requireSameRuntime(process, connection);
        if (client.queryEngineCatalog(false, 15_000)
                .filter(response -> response.path("engines").isArray() && !response.path("engines").isEmpty())
                .isEmpty()) {
            throw new IOException("Sidecar 未通过协议就绪验证");
        }
        requireSameRuntime(process, connection);
    }

    private void requireSameRuntime(Process process, String connection) throws IOException {
        if (process == null || registry.runningProcess() != process
                || connection == null || !connection.equals(client.sdkConnectionId())) {
            throw new IOException("观察期间 Sidecar 进程或连接失效");
        }
    }

    private static final class UpgradeDeferred extends IOException {
        private UpgradeDeferred(String message) { super(message); }
    }

    private static final class RecoveryRequired extends IOException {
        private RecoveryRequired(String message, Throwable cause) { super(message, cause); }
    }

    private void reconnect() throws IOException {
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

    /** @param running 是否执行中 @param phase 阶段 @param engine 所选引擎 ID，批量时逗号分隔 @param message 结果说明 @param logPath 本地日志 */
    public record UpgradeStatus(boolean running, String phase, String engine, String message, String logPath) { }
}
