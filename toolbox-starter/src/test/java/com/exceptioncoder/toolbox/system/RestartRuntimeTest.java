package com.exceptioncoder.toolbox.system;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFileAttributeView;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertTrue;

class RestartRuntimeTest {

    @TempDir
    Path tempDir;

    @Test
    @Timeout(value = 20, unit = TimeUnit.SECONDS)
    void detachedLauncherStartsTheRealJvmAndCanCancelItByPid() throws Exception {
        Path marker = tempDir.resolve("started.txt");
        Path source = tempDir.resolve("RestartDetachedProbe.java");
        Files.writeString(source, """
                import java.nio.file.*;
                public class RestartDetachedProbe {
                    public static void main(String[] args) throws Exception {
                        Files.writeString(Path.of(args[0]), Long.toString(ProcessHandle.current().pid()));
                        Thread.sleep(30000);
                    }
                }
                """);
        boolean windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        Path java = Path.of(System.getProperty("java.home"), "bin", windows ? "java.exe" : "java");
        RestartRuntime runtime = new RestartRuntime();

        RestartRuntime.SpawnedReplacement spawned = runtime.launchDetached(
                List.of(java.toString(), source.toString(), marker.toString()), tempDir, tempDir.resolve("probe.log"));
        try {
            if (Files.getFileAttributeView(spawned.argFile(), PosixFileAttributeView.class) != null) {
                assertTrue(Files.getPosixFilePermissions(spawned.argFile())
                        .equals(PosixFilePermissions.fromString("rw-------")));
            }
            waitForFile(spawned.pidFile());
            waitForFile(marker);
            long pid = Long.parseLong(Files.readString(spawned.pidFile()).trim());
            ProcessHandle replacement = runtime.processHandle(pid).orElseThrow();
            assertTrue(replacement.isAlive());
            assertTrue(Long.parseLong(Files.readString(marker).trim()) == pid);
        } finally {
            runtime.cancelSpawn(spawned);
        }
    }

    private static void waitForFile(Path path) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(12);
        while (!Files.isRegularFile(path) && System.nanoTime() < deadline) {
            Thread.sleep(50);
        }
        assertTrue(Files.isRegularFile(path), () -> "timed out waiting for " + path);
    }
}
