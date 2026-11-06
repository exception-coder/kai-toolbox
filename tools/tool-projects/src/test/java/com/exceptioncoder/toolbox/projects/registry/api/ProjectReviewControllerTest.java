package com.exceptioncoder.toolbox.projects.registry.api;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.git.GitReviewService;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.exceptioncoder.toolbox.projects.registry.application.ProjectRegistryService;
import com.exceptioncoder.toolbox.projects.registry.domain.RegistryProject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProjectReviewControllerTest {
    @TempDir Path root;
    @AfterEach void clear() { AuthContext.clear(); }
    @Test void sourceRequiresTheExistingProjectMenuPermissionBeforeResolvingFiles() {
        var registry = mock(ProjectRegistryService.class);
        var review = mock(GitReviewService.class);
        AuthContext.set(new AuthPrincipal(1, "viewer", List.of(), List.of(), "test", 0));
        var controller = new ProjectReviewController(registry, review, path -> true);
        assertThatThrownBy(() -> controller.source("project", "HEAD", "file.java"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        verifyNoInteractions(registry, review);
    }
    @Test void readBindsRegisteredIdentityAndRechecksCanonicalProjectPolicy() throws Exception {
        var registry = mock(ProjectRegistryService.class);
        var review = mock(GitReviewService.class);
        var access = mock(ProjectAccess.class);
        when(registry.require("project")).thenReturn(new RegistryProject("project", new RegistryProject.Metadata(
                "Project", root.toString(), "git", "", "main", "", "", ""), "REGISTERED", 0, 0L, 0L));
        AuthContext.set(new AuthPrincipal(1, "viewer", List.of(), List.of("menu:project-workspace"), "test", 0));
        new ProjectReviewController(registry, review, access).source("project", "HEAD", "file.java");
        verify(access).requireAllowed(root.toRealPath());
        verify(review).source(root.toRealPath(), "HEAD", "file.java");
    }
}
