package com.exceptioncoder.toolbox.system;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.UUID;
import java.util.jar.Attributes;
import java.util.jar.JarFile;
import java.util.jar.Manifest;

import static com.exceptioncoder.toolbox.system.RestartCoordinator.Failure;
import static com.exceptioncoder.toolbox.system.RestartCoordinator.RestartOutcome;

/** 校验并启动候选 fat jar，等待 replacement JVM 的接管等待握手。 */
@Component
public class CandidateHandoffLauncher {

    private static final Logger log = LoggerFactory.getLogger(CandidateHandoffLauncher.class);
    private static final String TOOLBOX_MAIN = "com.exceptioncoder.toolbox.ToolboxApplication";
    private static final String TOOLBOX_MAIN_ENTRY = "BOOT-INF/classes/com/exceptioncoder/toolbox/ToolboxApplication.class";
    private static final String HANDOFF_ENTRY = "BOOT-INF/classes/com/exceptioncoder/toolbox/system/RestartHandoff.class";
    private static final String AUTO_UPDATE_REPOSITORY_ARG = "--toolbox.system.auto-update.repository=";

    private final RestartProperties properties;
    private final RestartRuntime runtime;

    public CandidateHandoffLauncher(RestartProperties properties, RestartRuntime runtime) {
        this.properties = properties;
        this.runtime = runtime;
    }

    RestartOutcome preflight(Path stagedJar, Path repoRoot) {
        if (existingDirectory(repoRoot) == null) {
            return RestartOutcome.rejected(Failure.INVALID_REPOSITORY, "重启工作目录不存在");
        }
        Path candidate = existingFile(stagedJar);
        if (candidate == null || !isToolboxFatJar(candidate)) {
            return RestartOutcome.rejected(Failure.INVALID_CANDIDATE,
                    "候选文件不是包含 JVM 交接协议的 kai-toolbox fat jar");
        }
        if (stagedReleaseRoot(candidate) == null) {
            return RestartOutcome.rejected(Failure.INVALID_CANDIDATE,
                    "候选 fat jar 不在包含 pom.xml 的 release/toolbox-starter/target 目录中");
        }
        return commonPreflight();
    }

    private RestartOutcome preflightCurrent(Path executableJar, Path workingDirectory) {
        if (existingDirectory(workingDirectory) == null) {
            return RestartOutcome.rejected(Failure.INVALID_REPOSITORY, "当前进程工作目录不存在");
        }
        Path candidate = existingFile(executableJar);
        if (candidate == null || !isToolboxFatJar(candidate)) {
            return RestartOutcome.rejected(Failure.INVALID_CANDIDATE,
                    "当前可执行文件不是包含 JVM 交接协议的 kai-toolbox fat jar");
        }
        return commonPreflight();
    }

    private RestartOutcome commonPreflight() {
        Path java = runtime.javaExecutable();
        boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        if (!Files.isRegularFile(java) || !Files.isReadable(java) || (!windows && !Files.isExecutable(java))) {
            return RestartOutcome.rejected(Failure.JAVA_UNAVAILABLE, "当前 JDK 的 java 可执行文件不可用");
        }
        try {
            Path directory = properties.getHandoffDir().toAbsolutePath().normalize();
            Files.createDirectories(directory);
            RestartRuntime.restrictOwnerDirectory(directory);
            Path probe = Files.createTempFile(directory, ".write-probe-", ".tmp");
            Files.deleteIfExists(probe);
        } catch (IOException | RuntimeException e) {
            log.warn("[restart] handoff 目录不可写：{}", e.getMessage());
            return RestartOutcome.rejected(Failure.HANDOFF_FAILED, "JVM 交接目录不可写");
        }
        return RestartOutcome.accepted("fat jar 的 JVM 交接预检通过");
    }

    Launch launch(Path stagedJar, Path repoRoot, List<String> sourceApplicationArgs) {
        RestartOutcome preflight = preflight(stagedJar, repoRoot);
        if (!preflight.accepted()) return Launch.rejected(preflight);

        Path candidate = existingFile(stagedJar);
        Path originalRepo = existingDirectory(repoRoot);
        Path workingDirectory = stagedReleaseRoot(candidate);
        if (candidate == null || originalRepo == null || workingDirectory == null) {
            return Launch.rejected(RestartOutcome.rejected(Failure.HANDOFF_FAILED,
                    "交接前候选文件或工作目录发生变化"));
        }
        return launchValidated(candidate, workingDirectory, originalRepo, sourceApplicationArgs);
    }

    Launch launchCurrent(Path executableJar, Path workingDirectory, List<String> sourceApplicationArgs) {
        RestartOutcome preflight = preflightCurrent(executableJar, workingDirectory);
        if (!preflight.accepted()) return Launch.rejected(preflight);

        Path candidate = existingFile(executableJar);
        Path currentWorkingDirectory = existingDirectory(workingDirectory);
        if (candidate == null || currentWorkingDirectory == null) {
            return Launch.rejected(RestartOutcome.rejected(Failure.HANDOFF_FAILED,
                    "交接前当前 fat jar 或工作目录发生变化"));
        }
        return launchValidated(candidate, currentWorkingDirectory, null, sourceApplicationArgs);
    }

    private Launch launchValidated(Path candidate, Path workingDirectory, Path originalRepo,
                                   List<String> sourceApplicationArgs) {
        long parentPid = runtime.currentPid();
        String nonce = UUID.randomUUID().toString().replace("-", "");
        Path handoffDir = properties.getHandoffDir().toAbsolutePath().normalize();
        Path readyFile = handoffDir.resolve("ready-" + parentPid + "-" + nonce + ".properties");
        Path logFile = handoffDir.resolve("replacement-" + parentPid + "-" + nonce + ".log");
        RestartRuntime.SpawnedReplacement spawned = null;
        ProcessHandle replacement = null;
        try {
            Files.deleteIfExists(readyFile);
            List<String> command = replacementCommand(candidate, readyFile, nonce, parentPid,
                    originalRepo, sourceApplicationArgs);
            spawned = runtime.launchDetached(command, workingDirectory, logFile);
            Handshake handshake = waitUntilReady(spawned, readyFile, nonce, parentPid);
            if (!handshake.outcome().accepted()) {
                runtime.cancelSpawn(spawned);
                Files.deleteIfExists(readyFile);
                return Launch.rejected(handshake.outcome());
            }
            replacement = handshake.process();
            runtime.finishSpawn(spawned);
            log.warn("[restart] replacement JVM entered takeover wait: pid={}, jar={}, cwd={}",
                    replacement.pid(), candidate, workingDirectory);
            return new Launch(RestartOutcome.accepted("replacement JVM 已进入端口接管等待，当前服务即将优雅重启"),
                    replacement, readyFile);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            if (spawned != null) runtime.cancelSpawn(spawned);
            if (replacement != null) runtime.destroyProcessTree(replacement);
            deleteQuietly(readyFile);
            return Launch.rejected(RestartOutcome.rejected(Failure.HANDOFF_FAILED,
                    "等待 replacement JVM 时线程被中断，当前服务继续运行"));
        } catch (Exception e) {
            if (spawned != null) runtime.cancelSpawn(spawned);
            if (replacement != null) runtime.destroyProcessTree(replacement);
            deleteQuietly(readyFile);
            log.warn("[restart] replacement JVM 启动/握手失败：{}", e.getMessage());
            return Launch.rejected(RestartOutcome.rejected(Failure.HANDOFF_FAILED,
                    "replacement JVM 未完成握手，当前服务继续运行"));
        }
    }

    void cancel(Launch launch) {
        if (launch == null) return;
        if (launch.process() != null) runtime.destroyProcessTree(launch.process());
        deleteQuietly(launch.readyFile());
    }

    private List<String> replacementCommand(Path candidate, Path readyFile, String nonce,
                                             long parentPid, Path originalRepo,
                                             List<String> sourceApplicationArgs) {
        List<String> command = new ArrayList<>();
        command.add(runtime.javaExecutable().toString());
        command.addAll(runtime.safeJvmInputArguments());
        command.add("-jar");
        command.add(candidate.toString());
        command.add(RestartHandoff.PROTOCOL_ARG + RestartHandoff.PROTOCOL_VERSION);
        command.add(RestartHandoff.PARENT_PID_ARG + parentPid);
        command.add(RestartHandoff.READY_FILE_ARG + readyFile);
        command.add(RestartHandoff.NONCE_ARG + nonce);
        command.add(RestartHandoff.TIMEOUT_ARG + properties.getHandoffParentTimeout().toMillis());
        if (sourceApplicationArgs != null) {
            sourceApplicationArgs.stream()
                    .filter(argument -> argument != null && !isInternalArgument(argument)
                            && (originalRepo == null || !argument.startsWith(AUTO_UPDATE_REPOSITORY_ARG)))
                    .forEach(command::add);
        }
        // candidate 在 release worktree 中运行，以便相对路径依赖来自新版本；但后续 Git 更新
        // 仍必须针对用户的主 checkout，而不是 detached release worktree。
        if (originalRepo != null) {
            command.add(AUTO_UPDATE_REPOSITORY_ARG + originalRepo);
        }
        return List.copyOf(command);
    }

    private Handshake waitUntilReady(RestartRuntime.SpawnedReplacement spawned, Path readyFile,
                                     String nonce, long parentPid)
            throws IOException, InterruptedException {
        long deadline = System.nanoTime() + properties.getHandoffReadyTimeout().toNanos();
        while (System.nanoTime() < deadline) {
            if (Files.isRegularFile(readyFile)) {
                Properties ready = new Properties();
                try (Reader reader = Files.newBufferedReader(readyFile, StandardCharsets.UTF_8)) {
                    ready.load(reader);
                }
                long childPid = parsePid(ready.getProperty("childPid"));
                boolean valid = Integer.toString(RestartHandoff.PROTOCOL_VERSION)
                                .equals(ready.getProperty("protocolVersion"))
                        && nonce.equals(ready.getProperty("nonce"))
                        && Long.toString(parentPid).equals(ready.getProperty("parentPid"))
                        && "waiting".equals(ready.getProperty("state"));
                ProcessHandle process = valid ? runtime.processHandle(childPid).orElse(null) : null;
                if (valid && process != null && process.isAlive()) {
                    return new Handshake(RestartOutcome.accepted("replacement JVM takeover waiter ready"), process);
                }
                return Handshake.rejected("replacement JVM 握手内容不匹配或进程已退出，当前服务继续运行");
            }
            Thread.sleep(50);
        }
        return Handshake.rejected("等待 replacement JVM 握手超时，当前服务继续运行");
    }

    private static long parsePid(String value) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException | NullPointerException e) {
            return -1;
        }
    }

    private static boolean isToolboxFatJar(Path candidate) {
        try (JarFile jar = new JarFile(candidate.toFile(), true)) {
            Manifest manifest = jar.getManifest();
            if (manifest == null) return false;
            Attributes attributes = manifest.getMainAttributes();
            String startClass = attributes.getValue("Start-Class");
            String mainClass = attributes.getValue(Attributes.Name.MAIN_CLASS);
            return TOOLBOX_MAIN.equals(startClass)
                    && mainClass != null && mainClass.contains("JarLauncher")
                    && jar.getJarEntry(TOOLBOX_MAIN_ENTRY) != null
                    && jar.getJarEntry(HANDOFF_ENTRY) != null;
        } catch (IOException | SecurityException e) {
            return false;
        }
    }

    private static boolean isInternalArgument(String argument) {
        return argument.startsWith(RestartHandoff.PROTOCOL_ARG)
                || argument.startsWith(RestartHandoff.PARENT_PID_ARG)
                || argument.startsWith(RestartHandoff.READY_FILE_ARG)
                || argument.startsWith(RestartHandoff.NONCE_ARG)
                || argument.startsWith(RestartHandoff.TIMEOUT_ARG);
    }

    private static Path existingDirectory(Path path) {
        if (path == null) return null;
        try {
            Path real = path.toRealPath();
            return Files.isDirectory(real) ? real : null;
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    private static Path existingFile(Path path) {
        if (path == null) return null;
        try {
            Path real = path.toRealPath();
            return Files.isRegularFile(real) && Files.isReadable(real) ? real : null;
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /**
     * 自动更新构建器产物约定：{@code <release>/toolbox-starter/target/kai-toolbox.jar}。
     * cwd 必须是 release 根目录，不能回退到仍在运行旧版本的主 checkout。
     */
    private static Path stagedReleaseRoot(Path candidate) {
        if (candidate == null) return null;
        Path target = candidate.getParent();
        Path starter = target == null ? null : target.getParent();
        Path root = starter == null ? null : starter.getParent();
        if (target == null || starter == null || root == null
                || !"target".equalsIgnoreCase(fileName(target))
                || !"toolbox-starter".equalsIgnoreCase(fileName(starter))
                || !Files.isRegularFile(root.resolve("pom.xml"))
                || !Files.isRegularFile(starter.resolve("pom.xml"))) {
            return null;
        }
        return existingDirectory(root);
    }

    private static String fileName(Path path) {
        return path.getFileName() == null ? "" : path.getFileName().toString();
    }

    private static void deleteQuietly(Path path) {
        if (path == null) return;
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
        }
    }

    private record Handshake(RestartOutcome outcome, ProcessHandle process) {
        static Handshake rejected(String message) {
            return new Handshake(RestartOutcome.rejected(Failure.HANDOFF_FAILED, message), null);
        }
    }

    record Launch(RestartOutcome outcome, ProcessHandle process, Path readyFile) {
        static Launch rejected(RestartOutcome outcome) {
            return new Launch(outcome, null, null);
        }
    }
}
