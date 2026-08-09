package com.exceptioncoder.toolbox.foreconsult.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class CodexHomeDiscoveryServiceTest {

    @TempDir
    Path userHome;

    @Test
    void listsOnlyDirectChildDirectoriesWithCodexPrefix() throws Exception {
        Path defaultHome = Files.createDirectory(userHome.resolve(".codex"));
        Path accountHome = Files.createDirectory(userHome.resolve(".codex-account-yx"));
        Files.createDirectory(userHome.resolve(".claude"));
        Files.createFile(userHome.resolve(".codex-file"));
        Files.createDirectories(userHome.resolve("nested").resolve(".codex-hidden"));

        var homes = new CodexHomeDiscoveryService().list(userHome);

        assertThat(homes).containsExactly(
                defaultHome.toAbsolutePath().normalize().toString(),
                accountHome.toAbsolutePath().normalize().toString()
        );
    }

    @Test
    void returnsEmptyListWhenHomeDoesNotExist() {
        var homes = new CodexHomeDiscoveryService().list(userHome.resolve("missing"));

        assertThat(homes).isEmpty();
    }
}
