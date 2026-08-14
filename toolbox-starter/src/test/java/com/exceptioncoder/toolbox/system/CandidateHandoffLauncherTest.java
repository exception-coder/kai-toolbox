package com.exceptioncoder.toolbox.system;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.util.jar.Attributes;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import java.util.jar.Manifest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CandidateHandoffLauncherTest {

    @TempDir
    Path tempDir;

    @Test
    void candidateMustContainBootAndHandoffContract() throws Exception {
        RestartRuntime runtime = mock(RestartRuntime.class);
        when(runtime.javaExecutable()).thenReturn(javaExecutable());
        RestartProperties properties = properties();
        CandidateHandoffLauncher launcher = new CandidateHandoffLauncher(properties, runtime);
        Path repo = Files.createDirectory(tempDir.resolve("repo"));
        Path invalid = Files.writeString(tempDir.resolve("invalid.jar"), "not a jar");

        var outcome = launcher.preflight(invalid, repo);

        assertFalse(outcome.accepted());
        assertEquals(RestartCoordinator.Failure.INVALID_CANDIDATE, outcome.failure());
    }

    @Test
    void onlyReportsSuccessAfterNonceBoundReadyHandshake() throws Exception {
        RestartRuntime runtime = mock(RestartRuntime.class);
        RestartProperties properties = properties();
        CandidateHandoffLauncher launcher = new CandidateHandoffLauncher(properties, runtime);
        Path repo = Files.createDirectory(tempDir.resolve("repo"));
        StagedCandidate staged = stagedCandidate(tempDir.resolve("release"));
        Path candidate = staged.jar();
        ProcessHandle replacement = mock(ProcessHandle.class);
        when(replacement.pid()).thenReturn(9876L);
        when(replacement.isAlive()).thenReturn(true);
        when(runtime.javaExecutable()).thenReturn(javaExecutable());
        when(runtime.currentPid()).thenReturn(1234L);
        when(runtime.safeJvmInputArguments()).thenReturn(List.of("-Xmx256m", "-Dsample=value",
                "-Dtoolbox.auth.secret=must-be-preserved"));
        when(runtime.processHandle(9876L)).thenReturn(Optional.of(replacement));
        AtomicReference<List<String>> launchedCommand = new AtomicReference<>();
        RestartRuntime.SpawnedReplacement spawned = new RestartRuntime.SpawnedReplacement(
                mock(Process.class), null, null, null);
        when(runtime.launchDetached(anyList(), eq(staged.root().toRealPath()), any(Path.class)))
                .thenAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            List<String> command = invocation.getArgument(0, List.class);
            launchedCommand.set(List.copyOf(command));
            String readyArg = command.stream().filter(v -> v.startsWith(RestartHandoff.READY_FILE_ARG))
                    .findFirst().orElseThrow();
            String nonceArg = command.stream().filter(v -> v.startsWith(RestartHandoff.NONCE_ARG))
                    .findFirst().orElseThrow();
            Path ready = Path.of(readyArg.substring(RestartHandoff.READY_FILE_ARG.length()));
            String nonce = nonceArg.substring(RestartHandoff.NONCE_ARG.length());
            String payload = "protocolVersion=" + RestartHandoff.PROTOCOL_VERSION + "\n"
                    + "nonce=" + nonce + "\nparentPid=1234\nchildPid=9876\nstate=waiting\n";
            Files.writeString(ready, payload, StandardCharsets.UTF_8);
            return spawned;
        });

        CandidateHandoffLauncher.Launch launch = launcher.launch(candidate, repo,
                List.of("--server.port=19090", "--provider.api-token=must-be-preserved",
                        RestartHandoff.NONCE_ARG + "stale"));

        assertTrue(launch.outcome().accepted());
        assertNotNull(launch.process());
        assertTrue(launchedCommand.get().contains("-jar"));
        assertTrue(launchedCommand.get().contains(candidate.toRealPath().toString()));
        assertTrue(launchedCommand.get().contains("--server.port=19090"));
        assertTrue(launchedCommand.get().contains("--provider.api-token=must-be-preserved"));
        assertTrue(launchedCommand.get().contains("-Dtoolbox.auth.secret=must-be-preserved"));
        assertTrue(launchedCommand.get().contains("--toolbox.system.auto-update.repository=" + repo.toRealPath()));
        assertFalse(launchedCommand.get().contains(RestartHandoff.NONCE_ARG + "stale"));
        verify(runtime).finishSpawn(spawned);

        launcher.cancel(launch);
        verify(runtime).destroyProcessTree(replacement);
        assertFalse(Files.exists(launch.readyFile()));
    }

    @Test
    void stagedCandidateOutsideReleaseLayoutIsRejected() throws Exception {
        RestartRuntime runtime = mock(RestartRuntime.class);
        when(runtime.javaExecutable()).thenReturn(javaExecutable());
        CandidateHandoffLauncher launcher = new CandidateHandoffLauncher(properties(), runtime);
        Path repo = Files.createDirectory(tempDir.resolve("repo-layout"));
        Path candidate = toolboxFatJar(tempDir.resolve("standalone.jar"));

        var outcome = launcher.preflight(candidate, repo);

        assertFalse(outcome.accepted());
        assertEquals(RestartCoordinator.Failure.INVALID_CANDIDATE, outcome.failure());
    }

    @Test
    void manualCurrentJarKeepsCurrentWorkingDirectory() throws Exception {
        RestartRuntime runtime = mock(RestartRuntime.class);
        RestartProperties properties = properties();
        CandidateHandoffLauncher launcher = new CandidateHandoffLauncher(properties, runtime);
        Path workingDirectory = Files.createDirectory(tempDir.resolve("current-work"));
        Path currentJar = toolboxFatJar(tempDir.resolve("current.jar"));
        ProcessHandle replacement = mock(ProcessHandle.class);
        when(replacement.pid()).thenReturn(7788L);
        when(replacement.isAlive()).thenReturn(true);
        when(runtime.javaExecutable()).thenReturn(javaExecutable());
        when(runtime.currentPid()).thenReturn(6677L);
        when(runtime.safeJvmInputArguments()).thenReturn(List.of());
        when(runtime.processHandle(7788L)).thenReturn(Optional.of(replacement));
        RestartRuntime.SpawnedReplacement spawned = new RestartRuntime.SpawnedReplacement(
                mock(Process.class), null, null, null);
        when(runtime.launchDetached(anyList(), eq(workingDirectory.toRealPath()), any(Path.class)))
                .thenAnswer(invocation -> {
                    @SuppressWarnings("unchecked")
                    List<String> command = invocation.getArgument(0, List.class);
                    String readyValue = command.stream().filter(v -> v.startsWith(RestartHandoff.READY_FILE_ARG))
                            .findFirst().orElseThrow().substring(RestartHandoff.READY_FILE_ARG.length());
                    String nonce = command.stream().filter(v -> v.startsWith(RestartHandoff.NONCE_ARG))
                            .findFirst().orElseThrow().substring(RestartHandoff.NONCE_ARG.length());
                    Files.writeString(Path.of(readyValue), "protocolVersion=1\nnonce=" + nonce
                            + "\nparentPid=6677\nchildPid=7788\nstate=waiting\n");
                    return spawned;
                });

        var launch = launcher.launchCurrent(currentJar, workingDirectory, List.of("--server.port=18080"));

        assertTrue(launch.outcome().accepted());
        verify(runtime).launchDetached(anyList(), eq(workingDirectory.toRealPath()), any(Path.class));
    }

    private RestartProperties properties() {
        RestartProperties properties = new RestartProperties();
        properties.setHandoffDir(tempDir.resolve("handoff"));
        properties.setHandoffReadyTimeout(Duration.ofSeconds(1));
        properties.setHandoffParentTimeout(Duration.ofSeconds(2));
        return properties;
    }

    private static Path javaExecutable() {
        boolean windows = System.getProperty("os.name", "").toLowerCase().contains("win");
        return Path.of(System.getProperty("java.home"), "bin", windows ? "java.exe" : "java");
    }

    private static Path toolboxFatJar(Path path) throws Exception {
        Manifest manifest = new Manifest();
        manifest.getMainAttributes().put(Attributes.Name.MANIFEST_VERSION, "1.0");
        manifest.getMainAttributes().put(Attributes.Name.MAIN_CLASS,
                "org.springframework.boot.loader.launch.JarLauncher");
        manifest.getMainAttributes().putValue("Start-Class", "com.exceptioncoder.toolbox.ToolboxApplication");
        try (OutputStream output = Files.newOutputStream(path);
             JarOutputStream jar = new JarOutputStream(output, manifest)) {
            jar.putNextEntry(new JarEntry("BOOT-INF/classes/com/exceptioncoder/toolbox/ToolboxApplication.class"));
            jar.write(1);
            jar.closeEntry();
            jar.putNextEntry(new JarEntry("BOOT-INF/classes/com/exceptioncoder/toolbox/system/RestartHandoff.class"));
            jar.write(1);
            jar.closeEntry();
        }
        return path;
    }

    private static StagedCandidate stagedCandidate(Path root) throws Exception {
        Files.createDirectories(root);
        Files.writeString(root.resolve("pom.xml"), "<project/>");
        Path starter = Files.createDirectory(root.resolve("toolbox-starter"));
        Files.writeString(starter.resolve("pom.xml"), "<project/>");
        Path target = Files.createDirectory(starter.resolve("target"));
        return new StagedCandidate(root, toolboxFatJar(target.resolve("kai-toolbox.jar")));
    }

    private record StagedCandidate(Path root, Path jar) {
    }
}
