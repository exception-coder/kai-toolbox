package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OpenSpecProjectServiceTest {

    @TempDir
    Path projectDirectory;

    private ClaudeChatSessionRepository sessionRepository;
    private OpenSpecCliGateway cliGateway;
    private OpenSpecProjectService service;

    @BeforeEach
    void setUp() {
        sessionRepository = mock(ClaudeChatSessionRepository.class);
        WorkspaceScanService workspaceScanService = mock(WorkspaceScanService.class);
        cliGateway = mock(OpenSpecCliGateway.class);
        service = new OpenSpecProjectService(sessionRepository, workspaceScanService, cliGateway);
        ClaudeChatSession session = ClaudeChatSession.builder().cwd(projectDirectory.toString()).build();
        when(sessionRepository.findById("session-1")).thenReturn(Optional.of(session));
    }

    @Test
    void shouldReportNotInitializedWithoutWritingProject() {
        when(cliGateway.run(any(Path.class), eq(List.of("context", "--json"))))
                .thenReturn(result(1, "{\"code\":\"no_openspec_root\"}"));

        OpenSpecProjectService.ProjectStatus status = service.status(request("codex"));

        assertThat(status.state()).isEqualTo(OpenSpecProjectService.ProjectState.NOT_INITIALIZED);
        assertThat(status.path()).isEqualTo(projectDirectory.toAbsolutePath().normalize().toString());
    }

    @Test
    void shouldInitializeAndRecheckRootAfterUserConfirmation() {
        when(cliGateway.run(any(Path.class), eq(List.of("context", "--json"))))
                .thenReturn(result(1, "{\"code\":\"no_openspec_root\"}"))
                .thenReturn(result(0, "{\"root\":\"openspec\"}"));
        when(cliGateway.run(any(Path.class), eq(List.of("init", ".", "--tools", "codex"))))
                .thenReturn(result(0, "initialized"));

        OpenSpecProjectService.ProjectStatus status = service.initialize(request("codex"));

        assertThat(status.state()).isEqualTo(OpenSpecProjectService.ProjectState.READY);
        assertThat(status.message()).isEqualTo("OpenSpec 已初始化");
    }

    @Test
    void shouldExposeMissingCliAsRecoverableState() {
        when(cliGateway.run(any(Path.class), eq(List.of("context", "--json"))))
                .thenReturn(new OpenSpecCliGateway.CommandResult(false, false, -1, "not found"));

        OpenSpecProjectService.ProjectStatus status = service.status(request("claude"));

        assertThat(status.state()).isEqualTo(OpenSpecProjectService.ProjectState.TOOL_UNAVAILABLE);
        assertThat(status.message()).contains("安装 OpenSpec");
    }

    private OpenSpecProjectService.ProjectRequest request(String tool) {
        return new OpenSpecProjectService.ProjectRequest(projectDirectory.toString(), "session-1", tool);
    }

    private OpenSpecCliGateway.CommandResult result(int exitCode, String output) {
        return new OpenSpecCliGateway.CommandResult(true, false, exitCode, output);
    }
}
