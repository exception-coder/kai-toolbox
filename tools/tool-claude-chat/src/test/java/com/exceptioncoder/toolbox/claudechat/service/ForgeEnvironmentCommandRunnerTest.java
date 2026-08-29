package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ForgeEnvironmentCommandRunnerTest {

    @Test
    void shouldMergePathEntriesWithoutCaseInsensitiveDuplicates() {
        String merged = ForgeEnvironmentCommandRunner.mergePaths(
                "C:\\Windows;C:\\Users\\dev\\AppData\\Roaming\\npm",
                "c:\\windows;C:\\Users\\dev\\.local\\bin");

        assertThat(merged).isEqualTo(
                "c:\\windows;C:\\Users\\dev\\.local\\bin;C:\\Users\\dev\\AppData\\Roaming\\npm");
    }

    @Test
    void shouldPreferRealExecutablesOverWindowsStoreAliases() {
        String merged = ForgeEnvironmentCommandRunner.mergePaths(
                "C:\\Windows;C:\\Users\\tester\\AppData\\Local\\Microsoft\\WindowsApps",
                "C:\\Users\\tester\\AppData\\Local\\Microsoft\\WindowsApps;C:\\Users\\tester\\AppData\\Local\\Python\\bin;C:\\Users\\tester\\.local\\bin");

        assertThat(merged).isEqualTo(
                "C:\\Users\\tester\\AppData\\Local\\Python\\bin;C:\\Users\\tester\\.local\\bin;C:\\Windows;C:\\Users\\tester\\AppData\\Local\\Microsoft\\WindowsApps");
    }

    @Test
    @EnabledOnOs(OS.WINDOWS)
    void shouldDecodeWindowsCommandOutputAsUtf8() {
        ForgeEnvironmentCommandRunner runner = new ForgeEnvironmentCommandRunner();

        ForgeEnvironmentCommandRunner.CommandResult result = runner.run(
                List.of("powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                        "[Console]::OutputEncoding=[Text.Encoding]::UTF8;"
                                + "[Console]::Write(([char]0x672A)+([char]0x68C0)+([char]0x6D4B)+([char]0x5230))"),
                Duration.ofSeconds(5), null, null);

        assertThat(result.succeeded()).isTrue();
        assertThat(result.output()).isEqualTo("\u672A\u68C0\u6D4B\u5230");
    }
}
