package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceDirView;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.ProjectDependency;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionProjectDirectoryRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionProjectDirectoryServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void acceptsOnlyWorkspaceProjectsAndExcludesPrimaryDirectory() throws Exception {
        Path primary = tempDir.resolve("main");
        Path secondary = tempDir.resolve("api");
        java.nio.file.Files.createDirectories(primary);
        java.nio.file.Files.createDirectories(secondary);
        ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
        SessionProjectDirectoryRepository directories = mock(SessionProjectDirectoryRepository.class);
        WorkspaceScanService workspaces = mock(WorkspaceScanService.class);
        ProjectDependencyService projectDependencies = mock(ProjectDependencyService.class);
        when(sessions.findById("s1")).thenReturn(Optional.of(ClaudeChatSession.builder()
                .id("s1").cwd(primary.toString()).executionPolicy(SessionExecutionPolicy.STANDARD).build()));
        when(workspaces.scan()).thenReturn(workspace(primary, secondary));
        SessionProjectDirectoryService service = new SessionProjectDirectoryService(
                sessions, directories, workspaces, projectDependencies);

        assertThat(service.replace("s1", List.of(primary.toString(), secondary.toString(), secondary.toString())))
                .isTrue();

        verify(directories).replace(org.mockito.ArgumentMatchers.eq("s1"),
                org.mockito.ArgumentMatchers.eq(List.of(secondary.toAbsolutePath().normalize().toString())), anyLong());
        assertThatThrownBy(() -> service.replace("s1", List.of(tempDir.resolve("unknown").toString())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不在项目工作台");
    }

    @Test
    void buildsContextOnlyForStandardSessionsAndExistingDirectories() throws Exception {
        Path primary = tempDir.resolve("main");
        Path secondary = tempDir.resolve("web");
        java.nio.file.Files.createDirectories(primary);
        java.nio.file.Files.createDirectories(secondary);
        ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
        SessionProjectDirectoryRepository directories = mock(SessionProjectDirectoryRepository.class);
        when(directories.findPaths("s1")).thenReturn(List.of(secondary.toString(), tempDir.resolve("missing").toString()));
        ProjectDependencyService projectDependencies = mock(ProjectDependencyService.class);
        Path legacy = tempDir.resolve("legacy");
        java.nio.file.Files.createDirectories(legacy);
        when(projectDependencies.resolve(primary.toString())).thenReturn(List.of(
                new ProjectDependency(legacy.toString(), "legacy", true, true),
                new ProjectDependency(tempDir.resolve("legacy-missing").toString(), "legacy-missing", false, true)));
        SessionProjectDirectoryService service = new SessionProjectDirectoryService(
                sessions, directories, mock(WorkspaceScanService.class), projectDependencies);

        SessionProjectDirectoryService.SessionProjectContext context =
                service.buildContext("s1", primary.toString(), SessionExecutionPolicy.STANDARD);

        assertThat(context).isNotNull();
        assertThat(context.paths()).containsExactly(legacy.toString(), secondary.toString());
        assertThat(context.instructions()).contains(
                primary.toString(), secondary.toString(), "projectKey=legacy", "projectKey=legacy-missing",
                "source=missing", "domain-knowledge", "cross-topology", "分别检查各 Git 仓库状态");
        assertThat(service.buildContext("s1", primary.toString(), SessionExecutionPolicy.REVIEW_ONLY)).isNull();
    }

    private WorkspaceListResponse workspace(Path primary, Path secondary) {
        return new WorkspaceListResponse(List.of(new WorkspaceListResponse.RootView(
                tempDir.toString(), true, List.of(
                new WorkspaceDirView("main", primary.toString(), null, "main"),
                new WorkspaceDirView("api", secondary.toString(), null, "api")))), OffsetDateTime.now());
    }
}
