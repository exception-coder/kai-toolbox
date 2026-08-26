package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PluginUpdateServiceTest {

    @TempDir
    Path repo;

    @Test
    void shouldClassifyLocalJunkAndNullSeparatedPaths() {
        assertEquals(".idea/", PluginUpdateService.localIgnoreRule(".idea/misc.xml"));
        assertEquals(".kai-chat-attachments/",
                PluginUpdateService.localIgnoreRule(".kai-chat-attachments/task/image.png"));
        assertNull(PluginUpdateService.localIgnoreRule("knowledge/order.md"));
        assertEquals(List.of("knowledge/a.md", "knowledge/b.md"),
                PluginUpdateService.splitNullSeparated("knowledge/a.md\0knowledge/b.md\0"));
    }

    @Test
    void shouldAllowKnowledgeFilesAndRejectUnknownOrSensitiveFiles() throws Exception {
        Files.createDirectories(repo.resolve("knowledge"));
        Files.writeString(repo.resolve("knowledge/order.md"), "# Order", StandardCharsets.UTF_8);
        Files.writeString(repo.resolve("knowledge/credentials.json"), "{}", StandardCharsets.UTF_8);
        Files.writeString(repo.resolve("random.txt"), "local", StandardCharsets.UTF_8);

        assertTrue(PluginUpdateService.isValidNewFile(repo, "knowledge/order.md"));
        assertFalse(PluginUpdateService.isValidNewFile(repo, "knowledge/credentials.json"));
        assertFalse(PluginUpdateService.isValidNewFile(repo, "random.txt"));
    }

    @Test
    void shouldAppendGitignoreRulesWithoutDuplicates() throws Exception {
        Files.writeString(repo.resolve(".gitignore"), "node_modules/\n", StandardCharsets.UTF_8);

        assertTrue(PluginUpdateService.appendGitignoreRules(repo,
                List.of("node_modules/", ".idea/", ".kai-chat-attachments/")));
        assertFalse(PluginUpdateService.appendGitignoreRules(repo,
                List.of(".idea/", ".kai-chat-attachments/")));
        assertEquals("node_modules/\n.idea/\n.kai-chat-attachments/\n",
                Files.readString(repo.resolve(".gitignore"), StandardCharsets.UTF_8).replace("\r\n", "\n"));
    }

    @Test
    void shouldOnlyAllowRepositoryRelativeFilePaths() {
        assertTrue(PluginUpdateService.isValidRepositoryFilePath("skills/example/SKILL.md"));
        assertTrue(PluginUpdateService.isValidRepositoryFilePath("docs/../README.md"));
        assertFalse(PluginUpdateService.isValidRepositoryFilePath("../outside.txt"));
        assertFalse(PluginUpdateService.isValidRepositoryFilePath("/etc/passwd"));
        assertFalse(PluginUpdateService.isValidRepositoryFilePath("C:\\temp\\secret.txt"));
        assertFalse(PluginUpdateService.isValidRepositoryFilePath(""));
    }

    @Test
    void shouldRecognizeClaudeAndCodexLocalMarketplaceDirectories() throws Exception {
        Path marketplace = repo.resolve("team-standards").toAbsolutePath().normalize();
        ObjectMapper mapper = new ObjectMapper();

        assertTrue(PluginUpdateService.marketplaceUsesLocalDirectory(
                mapper.readTree("{\"path\":\"" + jsonPath(marketplace) + "\"}"), marketplace));
        assertTrue(PluginUpdateService.marketplaceUsesLocalDirectory(
                mapper.readTree("{\"marketplaceSource\":{\"source\":\"" + jsonPath(marketplace) + "\"}}"),
                marketplace));
        assertFalse(PluginUpdateService.marketplaceUsesLocalDirectory(
                mapper.readTree("{\"marketplaceSource\":{\"source\":\"https://github.com/team/repo.git\"}}"),
                marketplace));
    }

    @Test
    void shouldGateDependentStepsOnSuccessfulExit() {
        assertTrue(PluginUpdateService.stepSucceeded(Map.of("ok", true, "exitCode", 0)));
        assertFalse(PluginUpdateService.stepSucceeded(Map.of("ok", false, "exitCode", 1)));
        assertFalse(PluginUpdateService.stepSucceeded(Map.of("skipped", true)));
    }

    @Test
    void shouldReplaceOnlyExistingMcpRegistrations() {
        assertTrue(PluginUpdateService.mcpRegistrationExists(0));
        assertFalse(PluginUpdateService.mcpRegistrationExists(1));
        assertFalse(PluginUpdateService.mcpRegistrationExists(-1));
    }

    @Test
    void shouldUpdateInstalledClaudePluginInsteadOfSilentlySkippingIt() {
        List<String> base = List.of("claude", "plugin");

        assertEquals(List.of("claude", "plugin", "update", "team-standards@team-standards",
                        "--scope", "user"),
                PluginUpdateService.claudePluginCommand(base, "team-standards", true));
        assertEquals(List.of("claude", "plugin", "install", "team-standards@team-standards",
                        "--scope", "user"),
                PluginUpdateService.claudePluginCommand(base, "team-standards", false));
    }

    @Test
    void shouldRecordTheExistingRepositorySourceWithoutRewritingOrigin() {
        assertEquals("github", PluginUpdateService.gitSource(
                "git@github.com:wyoooni/team-standards.git", "gitee"));
        assertEquals("gitee", PluginUpdateService.gitSource(
                "https://gitee.com/wyoooni/team-standards.git", "github"));
        assertEquals("gitee", PluginUpdateService.gitSource(
                "ssh://git.internal/team-standards.git", "gitee"));
    }

    private static String jsonPath(Path path) {
        return path.toString().replace("\\", "\\\\");
    }
}
