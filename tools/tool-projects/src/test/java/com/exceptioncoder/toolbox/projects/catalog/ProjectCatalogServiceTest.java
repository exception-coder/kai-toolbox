package com.exceptioncoder.toolbox.projects.catalog;

import com.exceptioncoder.toolbox.common.project.*;
import com.exceptioncoder.toolbox.projects.registry.domain.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProjectCatalogServiceTest {
    @TempDir Path root;

    @Test void mergesRegisteredIdentityAndFiltersPolicyImmediately() throws Exception {
        Path project = Files.createDirectory(root.resolve("frontend")).toRealPath();
        Path sibling = Files.createDirectory(root.resolve("frontend-next")).toRealPath();
        Files.createDirectory(root.resolve(".hidden"));
        var directories = mock(ProjectDirectorySource.class);
        when(directories.scanRoots()).thenReturn(List.of(root, root));
        when(directories.hiddenPrefixes()).thenReturn(List.of("."));
        var store = mock(ProjectRegistryStore.class);
        when(store.projects()).thenReturn(List.of(new RegistryProject("system-1", new RegistryProject.Metadata(
                "ERP 小程序", project.toString(), "local", "", "", "", "", ""), "UNINITIALIZED", 0, 0L, 0L)));
        var properties = new ProjectCatalogProperties();
        var access = new ProjectVisibilityPolicy(properties);
        var catalog = new ProjectCatalogService(directories, store, access, properties);
        assertThat(catalog.list(false)).hasSize(2);
        assertThat(catalog.list(false)).filteredOn(item -> item.path().equals(project.toString()))
                .singleElement().satisfies(item -> { assertThat(item.name()).isEqualTo("ERP 小程序"); assertThat(item.systemId()).isEqualTo("system-1"); });
        properties.setExcludedPaths(List.of(project.toString()));
        assertThat(catalog.list(false)).extracting(ProjectCatalog.Entry::path).containsExactly(sibling.toString());
        assertThat(catalog.list(true)).filteredOn(ProjectCatalog.Entry::excluded).hasSize(1);
        assertThatThrownBy(() -> access.requireAllowed(project.resolve("src/missing.java"))).hasMessageContaining("全局排除");
        assertThat(access.allowed(sibling)).isTrue();
        properties.setExcludedPaths(List.of());
        assertThat(catalog.list(false)).hasSize(2);
    }

    @Test void preservesDistinctSameNamePathsAndMissingRegistration() throws Exception {
        Path first = Files.createDirectories(root.resolve("one/frontend"));
        Path second = Files.createDirectories(root.resolve("two/frontend"));
        var directories = mock(ProjectDirectorySource.class);
        when(directories.scanRoots()).thenReturn(List.of(first.getParent(), second.getParent()));
        when(directories.hiddenPrefixes()).thenReturn(List.of());
        var store = mock(ProjectRegistryStore.class);
        when(store.projects()).thenReturn(List.of());
        var properties = new ProjectCatalogProperties();
        var catalog = new ProjectCatalogService(directories, store, new ProjectVisibilityPolicy(properties), properties);
        assertThat(catalog.list(false)).hasSize(2).extracting(ProjectCatalog.Entry::id).doesNotHaveDuplicates();
        properties.setExcludedPaths(List.of(root.resolve("missing").toString()));
        assertThat(catalog.list(true)).filteredOn(item -> !item.available()).hasSize(1);
    }
}
