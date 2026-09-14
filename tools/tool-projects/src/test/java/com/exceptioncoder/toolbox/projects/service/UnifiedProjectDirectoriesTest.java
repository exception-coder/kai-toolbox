package com.exceptioncoder.toolbox.projects.service;

import com.exceptioncoder.toolbox.common.project.ProjectDirectorySource;
import com.exceptioncoder.toolbox.common.git.GitLogService;
import com.exceptioncoder.toolbox.common.git.GitProperties;
import com.exceptioncoder.toolbox.projects.api.ProjectsGitController;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class UnifiedProjectDirectoriesTest {
    @TempDir Path temp;

    @Test
    void scansBothRootsWithSharedFiltersAndChecksGitScope() throws Exception {
        Path first = Files.createDirectory(temp.resolve("first"));
        Path second = Files.createDirectory(temp.resolve("second"));
        Path one = Files.createDirectory(first.resolve("one"));
        Path two = Files.createDirectory(second.resolve("two"));
        Files.createDirectory(first.resolve(".hidden"));
        Files.createDirectory(two.resolve(".git"));
        var source = mock(ProjectDirectorySource.class);
        when(source.scanRoots()).thenReturn(List.of(first, second));
        when(source.hiddenPrefixes()).thenReturn(List.of("."));
        when(source.contains(two)).thenReturn(true);
        var scanner = new ProjectScanner(source);
        var registry = mock(com.exceptioncoder.toolbox.projects.registry.domain.ProjectRegistryStore.class);
        when(registry.projects()).thenReturn(List.of());
        var properties = new com.exceptioncoder.toolbox.projects.catalog.ProjectCatalogProperties();
        scanner.setProjectCatalog(new com.exceptioncoder.toolbox.projects.catalog.ProjectCatalogService(source, registry,
                new com.exceptioncoder.toolbox.projects.catalog.ProjectVisibilityPolicy(properties), properties));
        var result = scanner.scan();
        assertThat(result.items()).extracting(item -> item.path()).containsExactlyInAnyOrder(one.toString(), two.toString());
        assertThat(result.rootExists()).isTrue();
        var git = mock(GitLogService.class);
        var controller = new ProjectsGitController(source, new GitProperties(), git);
        controller.status(two.toString());
        verify(git).gitStatus(two);
        assertThatThrownBy(() -> controller.status(temp.resolve("outside").toString()))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("不在扫描根目录");
        verifyNoMoreInteractions(git);
    }
}
