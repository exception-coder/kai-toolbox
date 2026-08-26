package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ForgeEnvironmentView;
import com.exceptioncoder.toolbox.claudechat.api.dto.ForgeEnvironmentView.DependencyView;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ForgeEnvironmentBootstrapServiceTest {

    private ForgeEnvironmentService environmentService;
    private ForgeEnvironmentCommandRunner commandRunner;
    private PluginUpdateService pluginUpdateService;
    private SseEmitterRegistry sse;
    private ForgeEnvironmentBootstrapService service;

    @BeforeEach
    void setUp() {
        environmentService = mock(ForgeEnvironmentService.class);
        commandRunner = mock(ForgeEnvironmentCommandRunner.class);
        pluginUpdateService = mock(PluginUpdateService.class);
        sse = mock(SseEmitterRegistry.class);
        service = new ForgeEnvironmentBootstrapService(environmentService, commandRunner, pluginUpdateService, sse);
    }

    @Test
    void shouldSkipReadyToolsAndInstallTeamSuites() {
        ForgeEnvironmentView before = snapshot(false);
        ForgeEnvironmentView after = snapshot(true);
        when(environmentService.inspect(null, "gitee", false)).thenReturn(before, after);
        when(environmentService.inspectTool(anyString())).thenAnswer(invocation -> ready(invocation.getArgument(0)));
        when(pluginUpdateService.installDependencies("task-1", null, "gitee"))
                .thenReturn(List.of(Map.of("ok", true)));

        ForgeEnvironmentBootstrapService.BootstrapResult result =
                service.runBootstrap("task-1", null, "gitee");

        assertThat(result.ready()).isTrue();
        assertThat(result.restartRequired()).isFalse();
        verify(commandRunner, never()).run(any(), any(), any(), any());
        verify(pluginUpdateService).installDependencies("task-1", null, "gitee");
    }

    @Test
    void shouldStopWhenInstalledToolNeedsProcessRestart() {
        DependencyView missingGit = dependency("git", "MISSING");
        when(environmentService.inspect(null, "gitee", false)).thenReturn(snapshot(false));
        when(environmentService.inspectTool("git")).thenReturn(missingGit, missingGit);
        when(environmentService.installCommand("git")).thenReturn(List.of("winget", "install", "Git.Git"));
        when(commandRunner.run(any(), any(), any(), any()))
                .thenReturn(new ForgeEnvironmentCommandRunner.CommandResult(0, true, "installed"));

        ForgeEnvironmentBootstrapService.BootstrapResult result =
                service.runBootstrap("task-2", null, "gitee");

        assertThat(result.restartRequired()).isTrue();
        verify(pluginUpdateService, never()).installDependencies(anyString(), any(), anyString());
    }

    private static ForgeEnvironmentView snapshot(boolean ready) {
        return new ForgeEnvironmentView(ready ? "READY" : "BLOCKED", ready,
                ready ? 1 : 0, 1, ready ? 0 : 1, "2026-08-26T00:00:00Z", List.of());
    }

    private static DependencyView ready(String id) {
        return new DependencyView(id, id, "READY", true, "1.0.0", "已就绪", null, null, null);
    }

    private static DependencyView dependency(String id, String state) {
        return new DependencyView(id, id, state, true, null, "未就绪", null, "install", null);
    }
}
