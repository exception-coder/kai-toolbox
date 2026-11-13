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
        assertThatThrownBy(() -> controller.branches("someone-else", "linked:repo"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(() -> controller.commit("someone-else", "linked:repo", "HEAD"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(() -> controller.compactWorkspace("someone-else", "linked:repo", "combined"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(() -> controller.untrackedDirectory("someone-else", "linked:repo", "drafts", 0))
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
        controller.compactWorkspace("mine", "linked:bound", "combined");
        controller.untrackedDirectory("mine", "linked:bound", "drafts", 0);
        verify(review).workspace(root, "combined", true);
        verify(review).untrackedDirectory(root, "drafts", 0);
        controller.branches("mine", "linked:bound");
        controller.commit("mine", "linked:bound", "HEAD");
        verify(review).branches(root);
        verify(review).commit(root, "HEAD");
    }
}
