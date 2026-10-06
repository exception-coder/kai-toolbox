package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.common.git.GitLogService;
import com.exceptioncoder.toolbox.common.git.GitProperties;
import com.exceptioncoder.toolbox.common.git.GitPushOperations;
import com.exceptioncoder.toolbox.common.git.GitPushPreview;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class ClaudeChatGitControllerTest {
    @TempDir Path temporary;

    @Test
    void bindsPreviewAndPushToSelectedSessionChildRepository() throws Exception {
        Path child = Files.createDirectories(temporary.resolve("child"));
        Files.createDirectory(child.resolve(".git"));
        var repository = mock(ClaudeChatSessionRepository.class);
        when(repository.findById("session")).thenReturn(Optional.of(ClaudeChatSession.builder()
                .id("session").cwd(temporary.toString()).build()));
        var pushes = mock(GitPushOperations.class);
        var preview = new GitPushPreview("main", "head", "origin", "main", List.of("safe"),
                1, 0, "", "snapshot");
        when(pushes.preview(child)).thenReturn(preview);
        when(pushes.push(child, "snapshot")).thenReturn("推送成功");
        ProjectAccess access = path -> true;
        var controller = new ClaudeChatGitController(new com.exceptioncoder.toolbox.claudechat.service.SessionGitRepositoryService(repository, mock(com.exceptioncoder.toolbox.claudechat.service.SessionProjectDirectoryService.class), path -> true), new GitProperties(), mock(GitLogService.class),
                pushes, access);
        assertThat(controller.pushPreview("session", "child")).isEqualTo(preview);
        assertThat(controller.push("session", "child", new ClaudeChatGitController.PushRequest("snapshot")))
                .containsEntry("message", "推送成功");
        verify(pushes).push(child, "snapshot");
        verify(pushes).preview(child);
        assertThatThrownBy(() -> controller.push("session", "../child",
                new ClaudeChatGitController.PushRequest("snapshot"))).isInstanceOf(IllegalArgumentException.class);
        verifyNoMoreInteractions(pushes);
    }

    @Test
    void refusesExcludedRepositoryBeforeAnyPushOperation() throws Exception {
        Files.createDirectory(temporary.resolve(".git"));
        var repository = mock(ClaudeChatSessionRepository.class);
        when(repository.findById("session")).thenReturn(Optional.of(ClaudeChatSession.builder()
                .id("session").cwd(temporary.toString()).build()));
        var pushes = mock(GitPushOperations.class);
        var controller = new ClaudeChatGitController(new com.exceptioncoder.toolbox.claudechat.service.SessionGitRepositoryService(repository, mock(com.exceptioncoder.toolbox.claudechat.service.SessionProjectDirectoryService.class), path -> true), new GitProperties(), mock(GitLogService.class),
                pushes, path -> false);
        assertThatThrownBy(() -> controller.pushPreview("session", null)).hasMessageContaining("全局排除");
        assertThatThrownBy(() -> controller.push("session", null,
                new ClaudeChatGitController.PushRequest("snapshot"))).hasMessageContaining("全局排除");
        verifyNoInteractions(pushes);
    }
}
