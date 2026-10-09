package com.exceptioncoder.toolbox.claudechat.service.codexsync;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.*;

class CodexSyncHomesTest {
    @TempDir Path home;
    private final CodexSyncHomes guard = new CodexSyncHomes();

    @Test void acceptsOnlyRealDirectCodexDirectories() throws Exception {
        Path codex = Files.createDirectory(home.resolve(".codex"));
        Path account = Files.createDirectory(home.resolve(".codex-pro"));
        assertThat(guard.resolve(home, "")).isEqualTo(codex.toRealPath().toString());
        assertThat(guard.resolve(home, account.toString())).isEqualTo(account.toRealPath().toString());
        Path nested = Files.createDirectories(home.resolve("nested/.codex"));
        assertThatThrownBy(() -> guard.resolve(home, nested.toString())).hasMessageContaining("授权目录");
        assertThatThrownBy(() -> guard.resolve(home, home.resolve("missing").toString())).hasMessageContaining("授权目录");
        assertThatThrownBy(() -> guard.resolve(home, home.toString())).hasMessageContaining("授权目录");
    }
}
