package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceDirView;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import com.exceptioncoder.toolbox.claudechat.domain.ProjectDependency;
import com.exceptioncoder.toolbox.claudechat.domain.ProjectDependencyBinding;
import com.exceptioncoder.toolbox.claudechat.repository.ProjectDependencyRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProjectDependencyServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void replacesWorkspaceDependenciesInStableDeduplicatedOrder() throws Exception {
        Path primary = Files.createDirectories(tempDir.resolve("main"));
        Path legacy = Files.createDirectories(tempDir.resolve("legacy"));
        ProjectDependencyRepository repository = mock(ProjectDependencyRepository.class);
        WorkspaceScanService workspaces = workspaceService(primary, legacy);
        ProjectDependencyService service = new ProjectDependencyService(repository, workspaces);

        service.replace(primary.toString(), List.of(legacy.toString(), legacy.toString()));

        verify(repository).replace(
                org.mockito.ArgumentMatchers.eq(primary.toAbsolutePath().normalize().toString()),
                org.mockito.ArgumentMatchers.eq(List.of(new ProjectDependencyBinding(
                        legacy.toAbsolutePath().normalize().toString(), "legacy", "DEPENDS_ON"))),
                anyLong());
        assertThatThrownBy(() -> service.replace(primary.toString(), List.of(primary.toString())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不能依赖自身");
        assertThatThrownBy(() -> service.replace(primary.toString(), List.of(tempDir.resolve("unknown").toString())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不在项目工作台");
    }

    @Test
    void rejectsMoreThanEightRequestedDependencies() throws Exception {
        Path primary = Files.createDirectories(tempDir.resolve("main"));
        List<Path> dependencies = new java.util.ArrayList<>();
        for (int index = 0; index < 9; index++) {
            dependencies.add(Files.createDirectories(tempDir.resolve("legacy-" + index)));
        }
        WorkspaceScanService workspaces = mock(WorkspaceScanService.class);
        when(workspaces.scan()).thenReturn(new WorkspaceListResponse(List.of(
                new WorkspaceListResponse.RootView(tempDir.toString(), true,
                        java.util.stream.Stream.concat(java.util.stream.Stream.of(primary), dependencies.stream())
                                .map(path -> new WorkspaceDirView(
                                        path.getFileName().toString(), path.toString(), null, path.getFileName().toString()))
                                .toList())), OffsetDateTime.now()));
        ProjectDependencyService service = new ProjectDependencyService(
                mock(ProjectDependencyRepository.class), workspaces);
        List<String> tooMany = dependencies.stream().map(Path::toString).toList();

        assertThatThrownBy(() -> service.replace(primary.toString(), tooMany))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("最多关联 8 个");
    }

    @Test
    void resolvesSourceAndKnowledgeAvailabilityByDirectoryName() throws Exception {
        Path primary = Files.createDirectories(tempDir.resolve("main"));
        Path legacy = Files.createDirectories(tempDir.resolve("legacy-erp"));
        Path missing = tempDir.resolve("legacy-scm");
        Path knowledge = Files.createDirectories(tempDir.resolve("knowledge"));
        Files.createDirectories(knowledge.resolve("legacy-erp"));
        Files.createDirectories(knowledge.resolve("legacy-scm"));
        ProjectDependencyRepository repository = mock(ProjectDependencyRepository.class);
        when(repository.findBindings(primary.toAbsolutePath().normalize().toString()))
                .thenReturn(List.of(
                        new ProjectDependencyBinding(legacy.toString(), "legacy-erp", "REFACTORS"),
                        new ProjectDependencyBinding(missing.toString(), "legacy-scm", "DEPENDS_ON")));
        WorkspaceScanService workspaces = workspaceService(primary, legacy);
        when(workspaces.knowledgeDirectory()).thenReturn(knowledge.toString());
        ProjectDependencyService service = new ProjectDependencyService(repository, workspaces);

        List<ProjectDependency> dependencies = service.resolve(primary.toString());

        assertThat(dependencies).containsExactly(
                new ProjectDependency(legacy.toString(), "legacy-erp", "REFACTORS", true, true),
                new ProjectDependency(missing.toString(), "legacy-scm", "DEPENDS_ON", false, true));
    }

    private WorkspaceScanService workspaceService(Path primary, Path dependency) {
        WorkspaceScanService workspaces = mock(WorkspaceScanService.class);
        when(workspaces.scan()).thenReturn(new WorkspaceListResponse(List.of(
                new WorkspaceListResponse.RootView(tempDir.toString(), true, List.of(
                        new WorkspaceDirView(primary.getFileName().toString(), primary.toString(), null, primary.getFileName().toString()),
                        new WorkspaceDirView(dependency.getFileName().toString(), dependency.toString(), null, dependency.getFileName().toString())
                ))), OffsetDateTime.now()));
        when(workspaces.knowledgeDirectory()).thenReturn(tempDir.resolve("knowledge").toString());
        return workspaces;
    }
}
