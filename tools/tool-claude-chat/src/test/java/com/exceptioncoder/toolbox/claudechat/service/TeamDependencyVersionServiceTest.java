package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TeamDependencyVersionServiceTest {

    private final TeamDependencyVersionService service = new TeamDependencyVersionService(new ObjectMapper());

    @Test
    void shouldReadNamedPluginVersion() {
        String manifest = """
                {"plugins":[
                  {"name":"other","version":"1.0.0"},
                  {"name":"team-standards","version":"1.55.0"}
                ]}
                """;

        assertEquals("1.55.0", service.parsePluginVersion(manifest, "team-standards"));
        assertNull(service.parsePluginVersion(manifest, "missing"));
    }

    @Test
    void shouldRejectMalformedManifest() {
        assertThrows(IllegalStateException.class,
                () -> service.parsePluginVersion("not-json", "team-standards"));
    }

    @Test
    void shouldKeepRemoteUncheckedWithoutNetworkCall() {
        TeamDependencyVersionService.RemoteVersionSnapshot snapshot = service.readPlugin(
                java.nio.file.Path.of("missing"), "team-standards", "team-standards",
                "https://example.invalid/team-standards.git", "github", false);

        assertFalse(snapshot.checked());
        assertNull(snapshot.error());
    }

    @Test
    void shouldIsolateMissingRepositoryAsCheckedError() {
        TeamDependencyVersionService.RemoteVersionSnapshot snapshot = service.readMcp(
                java.nio.file.Path.of("missing"), "project-domain-knowledge",
                "https://example.invalid/project-domain-knowledge.git", "github", true);

        assertTrue(snapshot.checked());
        assertEquals("团队依赖仓库未拉取", snapshot.error());
    }

    @Test
    void shouldReadRemoteManifestWithoutChangingLocalHead(@TempDir Path tempDir) throws Exception {
        Path remote = tempDir.resolve("remote");
        Files.createDirectories(remote.resolve(".claude-plugin"));
        git(remote, "init", "-b", "main");
        git(remote, "config", "user.email", "test@example.com");
        git(remote, "config", "user.name", "Test User");
        writeManifest(remote, "1.0.0");
        git(remote, "add", ".");
        git(remote, "commit", "-m", "initial");

        Path local = tempDir.resolve("local");
        git(tempDir, "clone", remote.toString(), local.toString());
        writeManifest(remote, "1.1.0");
        git(remote, "add", ".");
        git(remote, "commit", "-m", "release");

        TeamDependencyVersionService.RemoteVersionSnapshot snapshot = service.readPlugin(
                local, "team-standards", "team-standards", remote.toString(), "github", true);

        assertTrue(snapshot.checked());
        assertEquals("1.1.0", snapshot.version());
        assertEquals(1, snapshot.behind());
        assertEquals("1.0.0", service.parsePluginVersion(
                Files.readString(local.resolve(".claude-plugin/marketplace.json")), "team-standards"));
    }

    private static void writeManifest(Path repository, String version) throws Exception {
        Files.writeString(repository.resolve(".claude-plugin/marketplace.json"), """
                {"plugins":[{"name":"team-standards","version":"%s"}]}
                """.formatted(version));
    }

    private static void git(Path directory, String... arguments) throws Exception {
        List<String> command = new ArrayList<>();
        command.add("git");
        command.addAll(List.of(arguments));
        Process process = new ProcessBuilder(command)
                .directory(directory.toFile())
                .redirectErrorStream(true)
                .start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertTrue(process.waitFor(10, TimeUnit.SECONDS), "Git command timed out: " + command);
        assertEquals(0, process.exitValue(), () -> "Git command failed: " + command + System.lineSeparator() + output);
    }
}
