package com.exceptioncoder.toolbox.system;

import com.exceptioncoder.toolbox.ToolboxApplication;
import org.springframework.boot.system.ApplicationHome;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFileAttributeView;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/** 隔离进程/运行时访问，便于重启协议做确定性测试。 */
@Component
public class RestartRuntime {

    public boolean isExternallySupervised() {
        return "1".equals(System.getenv("KAI_SUPERVISED"));
    }

    public String environment(String name) {
        return System.getenv(name);
    }

    public long currentPid() {
        return ProcessHandle.current().pid();
    }

    public Path workingDirectory() {
        return Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
    }

    public Optional<Path> repositoryRoot() {
        Path cursor = workingDirectory();
        while (cursor != null) {
            if (Files.exists(cursor.resolve(".git"))) {
                return Optional.of(realPath(cursor));
            }
            cursor = cursor.getParent();
        }
        return Optional.empty();
    }

    public Optional<Path> currentExecutableJar() {
        try {
            var source = new ApplicationHome(ToolboxApplication.class).getSource();
            if (source == null) return Optional.empty();
            Path path = source.toPath().toAbsolutePath().normalize();
            return Files.isRegularFile(path) && path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".jar")
                    ? Optional.of(path)
                    : Optional.empty();
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    public Path javaExecutable() {
        boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        return Path.of(System.getProperty("java.home"), "bin", windows ? "java.exe" : "java")
                .toAbsolutePath().normalize();
    }

    public List<String> safeJvmInputArguments() {
        return safeJvmInputArguments(ManagementFactory.getRuntimeMXBean().getInputArguments());
    }

    static List<String> safeJvmInputArguments(List<String> arguments) {
        List<String> result = new ArrayList<>();
        for (String argument : arguments) {
            String lower = argument.toLowerCase(Locale.ROOT);
            // IDE/debug/coverage agents often bind a unique port or hold files open. A restarted JVM
            // must not inherit them; normal -D/-X/-XX/module options remain intact.
            if (lower.startsWith("-agentlib:") || lower.startsWith("-agentpath:")
                    || lower.startsWith("-javaagent:") || lower.startsWith("-xrunjdwp")
                    || lower.equals("-xdebug") || lower.startsWith("-duser.dir=")
                    || lower.startsWith("-dtoolbox.performance.")) {
                continue;
            }
            result.add(argument);
        }
        return List.copyOf(result);
    }

    /** 通过 Java 原生进程 API 启动 replacement，参数文件避免 shell 与平台转义。 */
    public SpawnedReplacement launchDetached(List<String> command, Path workingDirectory, Path logFile)
            throws IOException {
        if (command == null || command.size() < 2) {
            throw new IOException("replacement command is incomplete");
        }
        Path directory = workingDirectory.toRealPath();
        Path log = logFile.toAbsolutePath().normalize();
        Path artifacts = log.getParent();
        if (artifacts == null) {
            throw new IOException("replacement log has no parent directory");
        }
        Files.createDirectories(artifacts);
        restrictOwnerDirectory(artifacts);
        ensurePrivateLog(log);
        String id = UUID.randomUUID().toString().replace("-", "");
        Path argFile = artifacts.resolve("replacement-" + id + ".args");
        Path pidFile = artifacts.resolve("replacement-" + id + ".pid");
        Files.writeString(argFile, encodeJavaArgFile(command.subList(1, command.size())));
        restrictOwnerFile(argFile);
        Process replacement = null;
        try {
            replacement = new ProcessBuilder(command.getFirst(), "@" + argFile)
                    .directory(directory.toFile())
                    .redirectErrorStream(true)
                    .redirectOutput(ProcessBuilder.Redirect.appendTo(log.toFile()))
                    .start();
            replacement.getOutputStream().close();
            Files.writeString(pidFile, Long.toString(replacement.pid()));
            restrictOwnerFile(pidFile);
            return new SpawnedReplacement(replacement, pidFile, argFile, null);
        } catch (IOException | RuntimeException error) {
            if (replacement != null) {
                destroyProcessTree(replacement);
            }
            deleteQuietly(argFile);
            deleteQuietly(pidFile);
            throw error;
        }
    }

    public Optional<ProcessHandle> processHandle(long pid) {
        if (pid <= 0) return Optional.empty();
        try {
            return ProcessHandle.of(pid);
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    public void finishSpawn(SpawnedReplacement spawned) {
        if (spawned == null) return;
        deleteQuietly(spawned.pidFile());
        deleteQuietly(spawned.argFile());
        deleteQuietly(spawned.helperScript());
    }

    public void cancelSpawn(SpawnedReplacement spawned) {
        if (spawned == null) return;
        readPid(spawned.pidFile()).flatMap(this::processHandle).ifPresent(this::destroyProcessTree);
        if (spawned.helper() != null) destroyProcessTree(spawned.helper().toHandle());
        finishSpawn(spawned);
    }

    public void destroyProcessTree(Process process) {
        if (process != null) destroyProcessTree(process.toHandle());
    }

    public void destroyProcessTree(ProcessHandle process) {
        if (process == null) return;
        List<ProcessHandle> descendants = process.descendants()
                .sorted(Comparator.comparingInt(RestartRuntime::depth).reversed())
                .toList();
        descendants.forEach(RestartRuntime::destroyQuietly);
        destroyQuietly(process);
        waitBriefly(process);
        descendants.stream().filter(ProcessHandle::isAlive).forEach(RestartRuntime::destroyForciblyQuietly);
        destroyForciblyQuietly(process);
    }

    public void exit(int status) {
        System.exit(status);
    }

    static Path realPath(Path path) {
        try {
            return path.toRealPath();
        } catch (IOException e) {
            return path.toAbsolutePath().normalize();
        }
    }

    private static int depth(ProcessHandle process) {
        int depth = 0;
        Optional<ProcessHandle> parent = process.parent();
        while (parent.isPresent() && depth < 64) {
            depth++;
            parent = parent.get().parent();
        }
        return depth;
    }

    private static void destroyQuietly(ProcessHandle process) {
        try {
            if (process.isAlive()) process.destroy();
        } catch (RuntimeException ignored) {
        }
    }

    private static void destroyForciblyQuietly(ProcessHandle process) {
        try {
            if (process.isAlive()) process.destroyForcibly();
        } catch (RuntimeException ignored) {
        }
    }

    private static void waitBriefly(ProcessHandle process) {
        try {
            process.onExit().get(2, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (java.util.concurrent.ExecutionException | java.util.concurrent.TimeoutException ignored) {
        }
    }

    private static Optional<Long> readPid(Path pidFile) {
        if (pidFile == null) return Optional.empty();
        try {
            return Optional.of(Long.parseLong(Files.readString(pidFile).trim()));
        } catch (IOException | RuntimeException e) {
            return Optional.empty();
        }
    }

    static void restrictOwnerDirectory(Path path) {
        restrictPosix(path, "rwx------");
    }

    static void restrictOwnerFile(Path path) {
        restrictPosix(path, "rw-------");
    }

    private static void restrictPosix(Path path, String permissions) {
        if (path == null || Files.getFileAttributeView(path, PosixFileAttributeView.class) == null) return;
        try {
            Files.setPosixFilePermissions(path, PosixFilePermissions.fromString(permissions));
        } catch (IOException | UnsupportedOperationException | SecurityException ignored) {
            // Windows/非 POSIX 文件系统没有该视图；安全性由当前用户 ACL 继承。
        }
    }

    private static String encodeJavaArgFile(List<String> arguments) {
        StringBuilder encoded = new StringBuilder();
        for (String argument : arguments) {
            String value = argument == null ? "" : argument;
            encoded.append('"')
                    .append(value.replace("\\", "\\\\")
                            .replace("\"", "\\\"")
                            .replace("\r", "\\r")
                            .replace("\n", "\\n"))
                    .append('"').append(System.lineSeparator());
        }
        return encoded.toString();
    }

    private static void deleteQuietly(Path path) {
        if (path == null) return;
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
        }
    }

    private static void ensurePrivateLog(Path path) throws IOException {
        Files.writeString(path, "", StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        restrictOwnerFile(path);
    }

    public record SpawnedReplacement(Process helper, Path pidFile, Path argFile, Path helperScript) {
    }
}
