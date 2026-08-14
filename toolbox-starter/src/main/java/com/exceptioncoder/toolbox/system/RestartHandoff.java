package com.exceptioncoder.toolbox.system;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * replacement JVM 的启动前交接协议。
 *
 * <p>新 JVM 先写 ready 文件，让旧 JVM 确认它已经成功加载到“接管等待”状态；随后新 JVM
 * 等待旧 PID 退出，避免两个 Spring 实例争抢 18080。此时 Spring 尚未启动，因此该握手不等价于
 * 运行期健康检查。所有内部参数都会在启动 Spring 前剥离。
 */
public final class RestartHandoff {

    static final int PROTOCOL_VERSION = 1;
    static final String PROTOCOL_ARG = "--toolbox-internal-handoff-protocol=";
    static final String PARENT_PID_ARG = "--toolbox-internal-handoff-parent-pid=";
    static final String READY_FILE_ARG = "--toolbox-internal-handoff-ready-file=";
    static final String NONCE_ARG = "--toolbox-internal-handoff-nonce=";
    static final String TIMEOUT_ARG = "--toolbox-internal-handoff-timeout-ms=";

    private RestartHandoff() {
    }

    /** 若存在内部交接参数则完成握手并等待旧 JVM；返回值只包含真正的应用参数。 */
    public static String[] awaitParentAndStrip(String[] sourceArgs) throws IOException, InterruptedException {
        Parsed parsed = parse(sourceArgs);
        if (parsed.request().isEmpty()) {
            return parsed.applicationArgs();
        }

        Request request = parsed.request().orElseThrow();
        long currentPid = ProcessHandle.current().pid();
        if (request.parentPid() == currentPid) {
            throw new IllegalArgumentException("handoff parent PID cannot be the replacement JVM itself");
        }

        writeReady(request, currentPid);
        try {
            Optional<ProcessHandle> parent = ProcessHandle.of(request.parentPid());
            if (parent.isPresent() && parent.get().isAlive()) {
                try {
                    parent.get().onExit().get(request.timeout().toMillis(), TimeUnit.MILLISECONDS);
                } catch (TimeoutException e) {
                    throw new IOException("timed out waiting for previous JVM to exit", e);
                } catch (java.util.concurrent.ExecutionException e) {
                    throw new IOException("failed while waiting for previous JVM to exit", e.getCause());
                }
            }
        } finally {
            Files.deleteIfExists(request.readyFile());
        }
        return parsed.applicationArgs();
    }

    static Parsed parse(String[] sourceArgs) {
        String[] args = sourceArgs == null ? new String[0] : sourceArgs;
        List<String> applicationArgs = new ArrayList<>(args.length);
        Integer protocol = null;
        Long parentPid = null;
        Path readyFile = null;
        String nonce = null;
        Long timeoutMs = null;
        boolean hasInternalArgument = false;

        for (String arg : args) {
            if (arg != null && arg.startsWith(PROTOCOL_ARG)) {
                protocol = unique(protocol, parseInt(arg, PROTOCOL_ARG), "protocol");
                hasInternalArgument = true;
            } else if (arg != null && arg.startsWith(PARENT_PID_ARG)) {
                parentPid = unique(parentPid, parseLong(arg, PARENT_PID_ARG), "parent PID");
                hasInternalArgument = true;
            } else if (arg != null && arg.startsWith(READY_FILE_ARG)) {
                String value = value(arg, READY_FILE_ARG);
                if (readyFile != null) throw new IllegalArgumentException("duplicate handoff ready file");
                readyFile = Path.of(value).toAbsolutePath().normalize();
                hasInternalArgument = true;
            } else if (arg != null && arg.startsWith(NONCE_ARG)) {
                nonce = unique(nonce, value(arg, NONCE_ARG), "nonce");
                hasInternalArgument = true;
            } else if (arg != null && arg.startsWith(TIMEOUT_ARG)) {
                timeoutMs = unique(timeoutMs, parseLong(arg, TIMEOUT_ARG), "timeout");
                hasInternalArgument = true;
            } else {
                applicationArgs.add(arg);
            }
        }

        if (!hasInternalArgument) {
            return new Parsed(Optional.empty(), applicationArgs.toArray(String[]::new));
        }
        if (protocol == null || protocol != PROTOCOL_VERSION) {
            throw new IllegalArgumentException("unsupported or missing handoff protocol");
        }
        if (parentPid == null || parentPid <= 0) {
            throw new IllegalArgumentException("invalid or missing handoff parent PID");
        }
        if (readyFile == null) {
            throw new IllegalArgumentException("missing handoff ready file");
        }
        if (nonce == null || nonce.isBlank() || nonce.length() > 128
                || nonce.indexOf('\n') >= 0 || nonce.indexOf('\r') >= 0) {
            throw new IllegalArgumentException("invalid or missing handoff nonce");
        }
        if (timeoutMs == null || timeoutMs < 1_000 || timeoutMs > Duration.ofMinutes(10).toMillis()) {
            throw new IllegalArgumentException("handoff timeout must be within 1s..10m");
        }
        return new Parsed(Optional.of(new Request(parentPid, readyFile, nonce, Duration.ofMillis(timeoutMs))),
                applicationArgs.toArray(String[]::new));
    }

    private static void writeReady(Request request, long childPid) throws IOException {
        Path parent = request.readyFile().getParent();
        if (parent == null) throw new IOException("handoff ready file has no parent directory");
        Files.createDirectories(parent);
        RestartRuntime.restrictOwnerDirectory(parent);
        String payload = "protocolVersion=" + PROTOCOL_VERSION + "\n"
                + "nonce=" + request.nonce() + "\n"
                + "parentPid=" + request.parentPid() + "\n"
                + "childPid=" + childPid + "\n"
                + "state=waiting\n";
        Path temporary = Files.createTempFile(parent, ".handoff-ready-", ".tmp");
        try {
            RestartRuntime.restrictOwnerFile(temporary);
            Files.writeString(temporary, payload, StandardCharsets.UTF_8);
            try {
                Files.move(temporary, request.readyFile(), StandardCopyOption.ATOMIC_MOVE,
                        StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temporary, request.readyFile(), StandardCopyOption.REPLACE_EXISTING);
            }
            RestartRuntime.restrictOwnerFile(request.readyFile());
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private static String value(String arg, String prefix) {
        String result = arg.substring(prefix.length());
        if (result.isBlank()) throw new IllegalArgumentException("empty internal handoff argument");
        return result;
    }

    private static int parseInt(String arg, String prefix) {
        try {
            return Integer.parseInt(value(arg, prefix));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("invalid internal handoff integer", e);
        }
    }

    private static long parseLong(String arg, String prefix) {
        try {
            return Long.parseLong(value(arg, prefix));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("invalid internal handoff number", e);
        }
    }

    private static <T> T unique(T previous, T value, String label) {
        if (previous != null) throw new IllegalArgumentException("duplicate handoff " + label);
        return value;
    }

    record Request(long parentPid, Path readyFile, String nonce, Duration timeout) {
    }

    record Parsed(Optional<Request> request, String[] applicationArgs) {
    }
}
