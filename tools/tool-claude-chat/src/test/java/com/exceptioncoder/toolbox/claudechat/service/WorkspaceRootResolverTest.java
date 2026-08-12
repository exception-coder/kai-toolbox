package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.BusinessWorkspaceProperties;
import com.exceptioncoder.toolbox.claudechat.config.WorkspaceProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class WorkspaceRootResolverTest {

    @TempDir
    Path tempDir;

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
