package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SessionGitRepositoryServiceTest {
    @TempDir Path temporary;

    @Test
    void linkedRepositoryIsSelectedAndRemovalInvalidatesOldSelection() throws Exception {
        Path primary = repository("forge");
        Path linked = repository("team-standards");
        var sessions = sessions(primary);
        var directories = mock(SessionProjectDirectoryService.class);
        when(directories.list("s")).thenReturn(List.of(linked.toString()));
        var service = new SessionGitRepositoryService(sessions, directories, path -> true);
        var repos = service.list("s");
        assertThat(repos).hasSize(2);
        assertThat(service.resolve("s", "")).isEqualTo(primary.toRealPath());
        String key = repos.get(1).name();
        assertThat(service.resolve("s", key)).isEqualTo(linked.toRealPath());
        when(directories.list("s")).thenReturn(List.of());
        assertThatThrownBy(() -> service.resolve("s", key)).hasMessageContaining("解除关联");
        assertThatThrownBy(() -> service.resolve("s", linked.toString())).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void excludedLinkedRepositoryCannotBeQueriedWithPreviouslyValidKey() throws Exception {
        Path primary = repository("forge");
        Path linked = repository("team-standards");
        var directories = mock(SessionProjectDirectoryService.class);
        when(directories.list("s")).thenReturn(List.of(linked.toString()));
        var sessions = sessions(primary);
        String key = new SessionGitRepositoryService(sessions, directories, path -> true).list("s").get(1).name();
        var service = new SessionGitRepositoryService(sessions, directories, path -> !path.equals(linked));
        assertThat(service.list("s")).hasSize(1);
        assertThatThrownBy(() -> service.resolve("s", key)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void linkedCollectionListsChildrenAndRevalidatesTheirMembership() throws Exception {
        Path primary = repository("forge");
        Path first = repository("team-tools/team-standards");
        Path second = repository("team-tools/project-coding-profiles");
        Path collection = first.getParent();
        Files.createDirectories(collection.resolve("plain-folder"));
        var directories = mock(SessionProjectDirectoryService.class);
        when(directories.list("s")).thenReturn(List.of(collection.toString(), first.toString()));
        var service = new SessionGitRepositoryService(sessions(primary), directories, path -> true);
        var repos = service.list("s");
        assertThat(repos).hasSize(3);
        String key = repos.stream().filter(repo -> repo.label().startsWith("team-standards"))
                .findFirst().orElseThrow().name();
        assertThat(service.resolve("s", key)).isEqualTo(first.toRealPath());
        var restricted = new SessionGitRepositoryService(sessions(primary), directories, path -> !path.equals(first));
        assertThat(restricted.list("s")).hasSize(2);
        assertThatThrownBy(() -> restricted.resolve("s", key)).hasMessageContaining("全局排除");
        when(directories.list("s")).thenReturn(List.of());
        assertThatThrownBy(() -> service.resolve("s", key)).hasMessageContaining("解除关联");
        assertThat(Files.exists(second.resolve(".git"))).isTrue();
    }

    @Test
    void aliasesOfPrimaryDoNotCreateDuplicateRepositories() throws Exception {
        Path primary = repository("forge");
        Path child = Files.createDirectories(primary.resolve("module"));
        var directories = mock(SessionProjectDirectoryService.class);
        when(directories.list("s")).thenReturn(List.of(primary.toString(), child.toString()));
        var service = new SessionGitRepositoryService(sessions(primary), directories, path -> true);
        assertThat(service.list("s")).hasSize(1);
    }

    private Path repository(String name) throws Exception {
        Path root = Files.createDirectories(temporary.resolve(name));
        Files.createDirectory(root.resolve(".git"));
        return root;
    }

    private ClaudeChatSessionRepository sessions(Path primary) {
        var sessions = mock(ClaudeChatSessionRepository.class);
        when(sessions.findById("s")).thenReturn(Optional.of(ClaudeChatSession.builder().id("s").cwd(primary.toString()).build()));
        return sessions;
    }
}
