package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.*;
import com.exceptioncoder.toolbox.claudechat.config.BusinessWorkspaceProperties;
import com.exceptioncoder.toolbox.claudechat.repository.ProjectRouteBindingRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.time.OffsetDateTime;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProjectCatalogRoutesTest {
    @TempDir Path root;

    @Test void realCatalogPathWinsOverMissingManagedTemplateAndNamesRemainUnambiguous() throws Exception {
        Path actual = Files.createDirectories(root.resolve("work/frontend"));
        var workspaces = mock(WorkspaceScanService.class);
        when(workspaces.scan()).thenReturn(snapshot(actual));
        var repository = mock(ProjectRouteBindingRepository.class);
        when(repository.findAll()).thenReturn(List.of());
        var knowledge = mock(TeamToolsPathService.class);
        when(knowledge.knowledgeProject(anyString())).thenReturn(root.resolve("knowledge"));
        var business = new BusinessWorkspaceProperties();
        business.setRoot(root.resolve("missing-managed").toString());
        var service = new ProjectRouteBindingService(repository, workspaces, mock(ProjectAliasService.class),
                new BusinessWorkspaceCatalog(), business, knowledge);
        assertThat(service.resolve("frontend").projectPath()).isEqualTo(actual.toString());
        assertThat(service.list()).hasSize(1);
        Path other = Files.createDirectories(root.resolve("other/frontend"));
        when(workspaces.scan()).thenReturn(snapshot(actual, other));
        assertThatThrownBy(() -> service.resolve("frontend")).hasMessageContaining("多个路由候选");
        assertThat(service.resolve(actual.toString()).projectPath()).isEqualTo(actual.toString());
    }

    private WorkspaceListResponse snapshot(Path... paths) {
        return new WorkspaceListResponse(List.of(new WorkspaceListResponse.RootView(root.toString(), true,
                java.util.Arrays.stream(paths).map(path -> new WorkspaceDirView("frontend", path.toString(), null, "ERP 小程序")).toList())), OffsetDateTime.now());
    }
}
