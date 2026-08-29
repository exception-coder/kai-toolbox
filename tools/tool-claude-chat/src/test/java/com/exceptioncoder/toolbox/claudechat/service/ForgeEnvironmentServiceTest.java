package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ForgeEnvironmentView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SuiteStatusView;
import com.exceptioncoder.toolbox.claudechat.api.dto.TeamRepositoryStatusView;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ForgeEnvironmentServiceTest {

    private StubCommandRunner commandRunner;
    private PluginUpdateService pluginUpdateService;
    private ForgeEnvironmentService service;

    @BeforeEach
    void setUp() {
        commandRunner = new StubCommandRunner();
        pluginUpdateService = mock(PluginUpdateService.class);
        service = new ForgeEnvironmentService(commandRunner, pluginUpdateService);
        stubReadyTools();
        when(pluginUpdateService.readSuites(null, false, "gitee")).thenReturn(readySuites());
        when(pluginUpdateService.readRepositoryStatuses("gitee", false)).thenReturn(readyRepositories());
    }

    @Test
    void shouldKeepMavenJavaMismatchAsNonBlockingAttention() {
        commandRunner.result("mvn --version", success("Apache Maven 3.9.16\nJava version: 1.8.0_151, vendor: Oracle"));

        ForgeEnvironmentView snapshot = service.inspect(null, "gitee", false);

        assertThat(snapshot.ready()).isTrue();
        assertThat(snapshot.state()).isEqualTo("ATTENTION");
        assertThat(snapshot.blockingCount()).isZero();
        ForgeEnvironmentView.DependencyView maven = item(snapshot, "maven");
        assertThat(maven.state()).isEqualTo("ATTENTION");
        assertThat(maven.detail()).contains("1.8.0_151");
    }

    @Test
    void shouldRefreshProcessPathBeforeInspectingTools() {
        service.inspect(null, "gitee", false);

        assertThat(commandRunner.pathRefreshed).isTrue();
    }

    @Test
    void shouldBlockWhenNodeDoesNotMeetOpenSpecMinimum() {
        commandRunner.result("node --version", success("v18.20.0"));

        ForgeEnvironmentView snapshot = service.inspect(null, "gitee", false);

        assertThat(snapshot.ready()).isFalse();
        assertThat(snapshot.state()).isEqualTo("BLOCKED");
        assertThat(item(snapshot, "node").state()).isEqualTo("INCOMPATIBLE");
    }

    @Test
    void shouldTreatExistingRepositorySourceMismatchAsAttention() {
        when(pluginUpdateService.readRepositoryStatuses("gitee", false)).thenReturn(List.of(
                new TeamRepositoryStatusView("team-standards", true, "github", false,
                        "abc123", "2026-08-26", null, 0, 0, false, false)));

        ForgeEnvironmentView snapshot = service.inspect(null, "gitee", false);

        assertThat(snapshot.ready()).isTrue();
        assertThat(snapshot.state()).isEqualTo("ATTENTION");
        assertThat(snapshot.blockingCount()).isZero();
        assertThat(item(snapshot, "repo-team-standards").state()).isEqualTo("ATTENTION");
        assertThat(item(snapshot, "repo-team-standards").blocking()).isFalse();
    }

    @Test
    @EnabledOnOs(OS.WINDOWS)
    void shouldProvideAutomaticInstallCommandsForCoreDeveloperToolsOnWindows() {
        assertThat(service.installCommand("uv"))
                .containsExactly("winget", "install", "--id", "astral-sh.uv", "-e", "--source", "winget",
                        "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity");
        assertThat(service.installCommand("python"))
                .containsExactly("uv", "python", "install", "3.12", "--default");
        assertThat(service.installCommand("claude"))
                .containsExactly("npm.cmd", "install", "--global", "@anthropic-ai/claude-code");
        assertThat(service.installCommand("codex"))
                .containsExactly("npm.cmd", "install", "--global", "@openai/codex");
        assertThat(service.installCommand("openspec"))
                .containsExactly("npm.cmd", "install", "--global", "@fission-ai/openspec@latest");

        ForgeEnvironmentView snapshot = service.inspect(null, "gitee", false);
        assertThat(item(snapshot, "openspec").installCommand())
                .isEqualTo("npm.cmd install --global @fission-ai/openspec@latest");
    }

    private void stubReadyTools() {
        commandRunner.result("git --version", success("git version 2.54.0"));
        commandRunner.result("node --version", success("v24.16.0"));
        commandRunner.result("npm --version", success("11.13.0"));
        commandRunner.result("python --version", success("Python 3.14.6"));
        commandRunner.result("uv --version", success("uv 0.11.29"));
        commandRunner.result("claude --version", success("2.1.224 (Claude Code)"));
        commandRunner.result("codex --version", success("codex-cli 0.147.0"));
        commandRunner.result("graphify --version", success("graphify 0.9.16"));
        commandRunner.result("openspec --version", success("1.6.0"));
        commandRunner.result("java --version", success("openjdk 21.0.12 2026-07-21 LTS"));
        commandRunner.result("mvn --version", success("Apache Maven 3.9.16\nJava version: 21.0.12, vendor: Microsoft"));
    }

    private List<SuiteStatusView> readySuites() {
        return List.of(
                suite("team-standards", "plugin", "1.0.0", "1.0.0", null),
                suite("project-coding-profiles", "plugin", "1.0.0", "1.0.0", null),
                suite("yoooni-daily-plugin", "plugin", "1.0.0", "1.0.0", null),
                suite("domain-knowledge", "mcp", null, null, "abc123"),
                suite("cross-topology", "mcp", null, null, "def456"));
    }

    private SuiteStatusView suite(String name, String kind, String claudeVersion,
                                  String codexVersion, String commit) {
        return new SuiteStatusView(name, kind, kind.equals("plugin") ? name : null,
                claudeVersion, codexVersion, null, true, commit, "2026-08-26",
                0, null, null, null, false, null);
    }

    private List<TeamRepositoryStatusView> readyRepositories() {
        return List.of("cross-project-topology", "project-coding-profiles", "project-domain-knowledge",
                        "team-standards", "yoooni-daily-plugin")
                .stream()
                .map(name -> new TeamRepositoryStatusView(name, true, "gitee", true,
                        "abc123", "2026-08-26", null, 0, 0, false, false))
                .toList();
    }

    private static ForgeEnvironmentView.DependencyView item(ForgeEnvironmentView snapshot, String id) {
        return snapshot.groups().stream().flatMap(group -> group.items().stream())
                .filter(item -> item.id().equals(id)).findFirst().orElseThrow();
    }

    private static ForgeEnvironmentCommandRunner.CommandResult success(String output) {
        return new ForgeEnvironmentCommandRunner.CommandResult(0, true, output);
    }

    private static final class StubCommandRunner extends ForgeEnvironmentCommandRunner {
        private final Map<String, CommandResult> results = new HashMap<>();
        private boolean pathRefreshed;

        private void result(String command, CommandResult result) {
            results.put(command, result);
        }

        @Override
        public void refreshEnvironmentPath() {
            pathRefreshed = true;
        }

        @Override
        public CommandResult run(List<String> command, Duration timeout, java.nio.file.Path workingDirectory,
                                 Consumer<String> outputConsumer) {
            return results.getOrDefault(String.join(" ", command), new CommandResult(-1, false, "missing"));
        }
    }
}
