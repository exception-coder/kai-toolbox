package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SessionGitRepositoryService;
import com.exceptioncoder.toolbox.common.git.GitReviewService;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SessionReviewControllerTest {
    @Test void unauthorizedSessionCannotResolveARepositoryOrReadSource() {
        var repositories = mock(SessionGitRepositoryService.class);
        var access = mock(ClaudeChatSessionAccessPolicy.class);
        var review = mock(GitReviewService.class);
        var controller = new SessionReviewController(repositories, review, access);
        assertThatThrownBy(() -> controller.source("someone-else", "linked:repo", "HEAD", "secret.txt"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(() -> controller.difference("someone-else", null, "WORKTREE", "secret.txt", "combined"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        verifyNoInteractions(repositories, review);
    }
    @Test void authorizedQueriesAlwaysReuseTheBoundRepositoryProjection() {
        var repositories = mock(SessionGitRepositoryService.class);
        var access = mock(ClaudeChatSessionAccessPolicy.class);
        var review = mock(GitReviewService.class);
        when(access.canAccessCurrentUser("mine")).thenReturn(true);
        Path root = Path.of("bound-repository");
        when(repositories.resolve("mine", "linked:bound")).thenReturn(root);
        var controller = new SessionReviewController(repositories, review, access);
        controller.tree("mine", "linked:bound", "HEAD", "src", 0);
        verify(review).tree(root, "HEAD", "src", 0);
        controller.difference("mine", "linked:bound", "WORKTREE", "src/file.java", "index");
        verify(review).difference(root, "WORKTREE", "src/file.java", "index");
    }
}
