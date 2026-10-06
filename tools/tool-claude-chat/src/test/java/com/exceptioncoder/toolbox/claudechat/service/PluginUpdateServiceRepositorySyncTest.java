package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.claudechat.config.PluginUpdateProperties;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 使用临时本地 Git 远端验证初始化和原仓库保护，不访问团队远端。 */
class PluginUpdateServiceRepositorySyncTest {
    @TempDir
    Path root;

    @Test
    void defaultsToUserTeamToolsDirectory() {
        PluginUpdateService service = service(new PluginUpdateProperties());
        assertEquals(Path.of(System.getProperty("user.home"), ".kai-toolbox", "team-tools")
                .toAbsolutePath().normalize(), ReflectionTestUtils.invokeMethod(service, "dependencyWorkspace"));
    }

    @Test
    void clonesMissingRepositoriesThenFastForwardsWithoutInstallingOrPushing() throws Exception {
        Path remote = remote();
        Path workspace = root.resolve("new-home/.kai-toolbox/team-tools");
        PluginUpdateProperties properties = new PluginUpdateProperties();
        properties.setDependencyWorkspace(workspace.toString());
        PluginUpdateService service = service(properties);
        try (MockedStatic<PluginUpdateService> routes = mockStatic(PluginUpdateService.class, CALLS_REAL_METHODS)) {
            routes.when(() -> PluginUpdateService.repoUrl(anyString(), anyString())).thenReturn(remote.toString());
            List<Map<String, Object>> first = service.syncRepositories("first", "github");
            assertEquals(5, first.size());
            assertTrue(first.stream().allMatch(PluginUpdateService::stepSucceeded));
            assertTrue(first.stream().allMatch(result -> result.get("step").toString().startsWith("clone:")));
            Files.writeString(remote.resolve("README.md"), "second");
            git(remote, "commit", "-am", "second");
            List<Map<String, Object>> second = service.syncRepositories("second", "gitee");
            assertTrue(second.stream().allMatch(PluginUpdateService::stepSucceeded));
            assertTrue(second.stream().allMatch(result -> result.get("step").toString().startsWith("pull:")));
            assertEquals("second", Files.readString(workspace.resolve("team-standards/README.md")));
            assertEquals(remote.toString(), git(workspace.resolve("team-standards"), "remote", "get-url", "origin"));
        }
    }

    @Test
    void keepsDirtyAndNonGitDirectoriesAndContinuesOtherRepositories() throws Exception {
        Path remote = remote();
        Path workspace = root.resolve("team-tools");
        Files.createDirectories(workspace);
        git(workspace, "clone", remote.toString(), "team-standards");
        Path dirty = workspace.resolve("team-standards/README.md");
        Files.writeString(dirty, "local edits");
        Path occupied = workspace.resolve("cross-project-topology");
        Files.createDirectories(occupied);
        Files.writeString(occupied.resolve("keep.txt"), "keep");
        PluginUpdateProperties properties = new PluginUpdateProperties();
        properties.setDependencyWorkspace(workspace.toString());
        try (MockedStatic<PluginUpdateService> routes = mockStatic(PluginUpdateService.class, CALLS_REAL_METHODS)) {
            routes.when(() -> PluginUpdateService.repoUrl(anyString(), anyString())).thenReturn(remote.toString());
            List<Map<String, Object>> results = service(properties).syncRepositories("safe", "github");
            assertEquals(2, results.stream().filter(result -> !PluginUpdateService.stepSucceeded(result)).count());
            assertEquals("local edits", Files.readString(dirty));
            assertEquals("keep", Files.readString(occupied.resolve("keep.txt")));
            assertTrue(Files.isDirectory(workspace.resolve("project-domain-knowledge/.git")));
        }
    }

    private PluginUpdateService service(PluginUpdateProperties properties) {
        return new PluginUpdateService(properties, new ClaudeChatProperties(), null,
                mock(SseEmitterRegistry.class), new ObjectMapper(), null, null, null);
    }

    private Path remote() throws Exception {
        Path remote = root.resolve("remote");
        Files.createDirectories(remote);
        git(remote, "init", "-b", "main");
        git(remote, "config", "user.name", "Test Fixture");
        git(remote, "config", "user.email", "fixture@example.invalid");
        Files.writeString(remote.resolve("README.md"), "first");
        git(remote, "add", "README.md");
        git(remote, "commit", "-m", "first");
        return remote;
    }

    private String git(Path directory, String... arguments) throws Exception {
        java.util.ArrayList<String> command = new java.util.ArrayList<>(List.of("git"));
        command.addAll(List.of(arguments));
        Process process = new ProcessBuilder(command).directory(directory.toFile()).redirectErrorStream(true).start();
        assertTrue(process.waitFor(30, TimeUnit.SECONDS), "local Git fixture timed out");
        String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        assertEquals(0, process.exitValue(), output);
        return output.trim();
    }
}
