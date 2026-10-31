package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.SessionGitRepositoryService;
import com.exceptioncoder.toolbox.common.git.GitWorkspaceOperations;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class ClaudeChatGitWorkspaceControllerTest {
    @Test
    void usesResolvedRepositoryForEachActionAndRejectsExcludedPathsBeforeGit() {
        var repositories = mock(SessionGitRepositoryService.class);
        var operations = mock(GitWorkspaceOperations.class);
        Path root = Path.of("selected-repository");
        when(repositories.resolve("s", "linked:repo")).thenReturn(root);
        when(operations.switchBranch(root, "refs/heads/feature", "token")).thenReturn("done");
        var request = new ClaudeChatGitWorkspaceController.SwitchRequest("refs/heads/feature", "token");
        var controller = new ClaudeChatGitWorkspaceController(repositories, path -> true, operations);
        controller.status("s", "linked:repo");
        controller.refresh("s", "linked:repo");
        controller.prepare("s", "linked:repo", request);
        controller.execute("s", "linked:repo", request);
        verify(operations).status(root, false);
        verify(operations).status(root, true);
        verify(operations).prepareSwitch(root, request.ref());
        verify(operations).switchBranch(root, request.ref(), request.token());
        var denied = new ClaudeChatGitWorkspaceController(repositories, path -> false, operations);
        assertThatThrownBy(() -> denied.status("s", "linked:repo")).hasMessageContaining("全局排除");
        assertThatThrownBy(() -> denied.refresh("s", "linked:repo")).hasMessageContaining("全局排除");
        assertThatThrownBy(() -> denied.prepare("s", "linked:repo", request)).hasMessageContaining("全局排除");
        assertThatThrownBy(() -> denied.execute("s", "linked:repo", request)).hasMessageContaining("全局排除");
        verifyNoMoreInteractions(operations);
    }
}
