package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class CodexHomeDiscoveryServiceTest {

    @TempDir
    Path userHome;

    @Test
    void listsOnlyDirectCodexDirectoriesInStableOrder() throws Exception {
        Files.createDirectories(userHome.resolve(".codex-team"));
        Files.createDirectories(userHome.resolve(".codex"));
        Files.createDirectories(userHome.resolve("projects/.codex-nested"));
        Files.writeString(userHome.resolve(".codex-file"), "not a directory");

        assertThat(new CodexHomeDiscoveryService().list(userHome))
                .containsExactly(userHome.resolve(".codex").toString(), userHome.resolve(".codex-team").toString());
    }
}
