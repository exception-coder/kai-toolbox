package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.BusinessWorkspaceProperties;
import com.exceptioncoder.toolbox.claudechat.config.WorkspaceProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.nio.file.Files;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class WorkspaceRootResolverTest {

    @Test
    void unifiedSaveRetiresLegacyRootEvenWhenTheListIsEmpty() {
        var workspace = new WorkspaceProperties();
        Path current = tempDir.resolve("current");
        Path legacy = tempDir.resolve("legacy");
        workspace.setRoots(List.of(current.toString()));
        var business = mock(BusinessWorkspaceProperties.class);
        when(business.resolveRoot()).thenReturn(tempDir.resolve("uncreated-managed"));
        var resolver = new WorkspaceRootResolver(workspace, business);
        resolver.setLegacyDirectory(() -> legacy.toString());
        assertThat(resolver.scanRoots()).contains(current, legacy);
        workspace.setDirectoriesUnified(true);
        assertThat(resolver.scanRoots()).contains(current).doesNotContain(legacy);
        assertThat(resolver.contains(legacy.resolve("project"))).isFalse();
        workspace.setRoots(List.of());
        assertThat(resolver.scanRoots()).isEmpty();
    }

    @TempDir
    Path tempDir;

    @Test
    void omitsAbsentImplicitRootFromDiscoveryButKeepsAuthorization() {
        Path managed = tempDir.resolve("unused-sources");
        var business = mock(BusinessWorkspaceProperties.class);
        when(business.resolveRoot()).thenReturn(managed);
        when(business.getRoot()).thenReturn("");
        var workspace = new WorkspaceProperties();
        workspace.setRoots(List.of());
        var resolver = new WorkspaceRootResolver(workspace, business);
        assertThat(resolver.scanRoots()).isEmpty();
        assertThat(resolver.roots()).containsExactly(managed);
        assertThat(resolver.contains(managed.resolve("new-project"))).isTrue();
        assertThat(Files.exists(managed)).isFalse();
    }

    @Test
    void preservesExplicitMissingRootsEvenWhenTheyMatchTheDefault() {
        Path managed = tempDir.resolve("sources");
        var business = mock(BusinessWorkspaceProperties.class);
        when(business.resolveRoot()).thenReturn(managed);
        when(business.getRoot()).thenReturn("");
        var workspace = new WorkspaceProperties();
        workspace.setRoots(List.of(managed.toString()));
        var resolver = new WorkspaceRootResolver(workspace, business);
        assertThat(resolver.scanRoots()).containsExactly(managed);
        workspace.setRoots(List.of());
        when(business.getRoot()).thenReturn(managed.toString());
        assertThat(resolver.scanRoots()).containsExactly(managed);
    }

    @Test
    void discoversCreatedDefaultAndRetainsInvalidExistingFile() throws Exception {
        Path managed = tempDir.resolve("sources");
        var business = mock(BusinessWorkspaceProperties.class);
        when(business.resolveRoot()).thenReturn(managed);
        var workspace = new WorkspaceProperties();
        workspace.setRoots(List.of());
        var resolver = new WorkspaceRootResolver(workspace, business);
        Files.createDirectory(managed);
        assertThat(resolver.scanRoots()).containsExactly(managed);
        Files.delete(managed);
        Files.writeString(managed, "not a directory");
        assertThat(resolver.scanRoots()).containsExactly(managed);
    }

    @Test
    void mergesConfiguredAndManagedRootsWithoutDuplicates() {
        Path configured = tempDir.resolve("projects");
        Path managed = tempDir.resolve("business-systems");
        WorkspaceProperties workspaceProperties = new WorkspaceProperties();
        workspaceProperties.setRoots(List.of(configured.toString(), managed.toString()));
        BusinessWorkspaceProperties businessProperties = new BusinessWorkspaceProperties();
        businessProperties.setRoot(managed.toString());

        WorkspaceRootResolver resolver = new WorkspaceRootResolver(workspaceProperties, businessProperties);

        assertThat(resolver.roots()).containsExactly(
                configured.toAbsolutePath().normalize(), managed.toAbsolutePath().normalize());
        assertThat(resolver.contains(managed.resolve("srm-system"))).isTrue();
        assertThat(resolver.contains(tempDir.resolve("outside"))).isFalse();
    }
}
