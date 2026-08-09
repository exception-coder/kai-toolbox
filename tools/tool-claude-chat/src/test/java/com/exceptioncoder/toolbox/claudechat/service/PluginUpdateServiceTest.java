package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

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
}
