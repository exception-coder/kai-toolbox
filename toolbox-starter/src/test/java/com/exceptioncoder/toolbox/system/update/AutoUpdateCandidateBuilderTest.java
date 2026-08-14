package com.exceptioncoder.toolbox.system.update;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Comparator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AutoUpdateCandidateBuilderTest {

    private static final String SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String NEXT_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    @TempDir
    Path temp;

    @Test
    void removesManagedWorktreeWhenCandidateBuildFails() throws Exception {
        AutoUpdateProperties properties = new AutoUpdateProperties();
        properties.setBuildTimeout(Duration.ofSeconds(5));
        AutoUpdateRepository repository = mock(AutoUpdateRepository.class);
        AutoUpdateCommandRunner runner = mock(AutoUpdateCommandRunner.class);
        AutoUpdateCandidateBuilder builder = new AutoUpdateCandidateBuilder(
                properties, repository, runner, temp.toString());
        Path root = temp.resolve("repo");
        Files.createDirectories(root);
        Path stage = temp.resolve("auto-update/releases").resolve(SHA);

        when(repository.addDetachedWorktree(eq(root), eq(stage), eq(SHA))).thenAnswer(invocation -> {
            Files.createDirectories(stage.resolve("sidecar/claude-agent"));
            Files.writeString(stage.resolve("sidecar/claude-agent/package.json"), "{}");
            return success();
        });
        when(runner.runTool(eq(stage.resolve("sidecar/claude-agent")), any(), any(), any()))
                .thenReturn(AutoUpdateCommandRunner.Result.failed("npm failed"));
        when(repository.removeWorktree(root, stage)).thenAnswer(invocation -> {
            try (var paths = Files.walk(stage)) {
                for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                    Files.deleteIfExists(path);
                }
            }
            return success();
        });

        AutoUpdateCandidateBuilder.BuildResult result = builder.prepare(root, SHA);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).contains("Claude sidecar");
        assertThat(Files.exists(stage)).isFalse();
        assertThat(Files.exists(temp.resolve("auto-update/releases/.kai-auto-update-owner-"
                + SHA + ".marker"))).isFalse();
        verify(repository).removeWorktree(root, stage);
    }

    @Test
    void refusesToAccumulateSuffixWorktreesWhenCanonicalStageIsUnready() throws Exception {
        AutoUpdateProperties properties = new AutoUpdateProperties();
        AutoUpdateRepository repository = mock(AutoUpdateRepository.class);
        AutoUpdateCommandRunner runner = mock(AutoUpdateCommandRunner.class);
        AutoUpdateCandidateBuilder builder = new AutoUpdateCandidateBuilder(
                properties, repository, runner, temp.toString());
        Path root = temp.resolve("repo");
        Files.createDirectories(root);
        Path stale = temp.resolve("auto-update/releases").resolve(SHA);
        Files.createDirectories(stale);
        when(repository.removeWorktree(root, stale))
                .thenReturn(AutoUpdateCommandRunner.Result.failed("cleanup busy"));
        when(repository.worktreeRegistration(root, stale))
                .thenReturn(new AutoUpdateRepository.WorktreeRegistration(true, null));

        AutoUpdateCandidateBuilder.BuildResult result = builder.prepare(root, SHA);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).contains("拒绝继续累积 worktree");
        verify(repository, never()).addDetachedWorktree(any(), any(), any());
    }

    @Test
    void retriesCleanupOfOwnedUnreadyWorktreeOnLaterCandidate() throws Exception {
        AutoUpdateProperties properties = new AutoUpdateProperties();
        AutoUpdateRepository repository = mock(AutoUpdateRepository.class);
        AutoUpdateCommandRunner runner = mock(AutoUpdateCommandRunner.class);
        AutoUpdateCandidateBuilder builder = new AutoUpdateCandidateBuilder(
                properties, repository, runner, temp.toString());
        Path root = Files.createDirectories(temp.resolve("repo"));
        Path releases = Files.createDirectories(temp.resolve("auto-update/releases"));
        Path stale = Files.createDirectories(releases.resolve(SHA));
        Path owner = releases.resolve(".kai-auto-update-owner-" + SHA + ".marker");
        Files.writeString(owner, SHA);

        when(repository.removeWorktree(root, stale)).thenAnswer(invocation -> {
            Files.deleteIfExists(stale);
            return success();
        });
        when(repository.addDetachedWorktree(root, releases.resolve(NEXT_SHA), NEXT_SHA))
                .thenReturn(AutoUpdateCommandRunner.Result.failed("stop after cleanup"));

        AutoUpdateCandidateBuilder.BuildResult result = builder.prepare(root, NEXT_SHA);

        assertThat(result.success()).isFalse();
        assertThat(Files.exists(stale)).isFalse();
        assertThat(Files.exists(owner)).isFalse();
        verify(repository).removeWorktree(root, stale);
    }

    @Test
    void deletesOwnedPartialDirectoryOnlyAfterGitConfirmsItIsUnregistered() throws Exception {
        AutoUpdateProperties properties = new AutoUpdateProperties();
        AutoUpdateRepository repository = mock(AutoUpdateRepository.class);
        AutoUpdateCommandRunner runner = mock(AutoUpdateCommandRunner.class);
        AutoUpdateCandidateBuilder builder = new AutoUpdateCandidateBuilder(
                properties, repository, runner, temp.toString());
        Path root = Files.createDirectories(temp.resolve("repo"));
        Path stage = temp.resolve("auto-update/releases").resolve(SHA);

        when(repository.addDetachedWorktree(root, stage, SHA)).thenAnswer(invocation -> {
            Files.createDirectories(stage.resolve("sidecar/claude-agent"));
            Files.writeString(stage.resolve("sidecar/claude-agent/package.json"), "{}");
            return success();
        });
        when(runner.runTool(eq(stage.resolve("sidecar/claude-agent")), any(), any(), any()))
                .thenReturn(AutoUpdateCommandRunner.Result.failed("npm failed"));
        when(repository.removeWorktree(root, stage))
                .thenReturn(AutoUpdateCommandRunner.Result.failed("not a working tree"));
        when(repository.pruneWorktrees(root)).thenReturn(success());
        when(repository.worktreeRegistration(root, stage))
                .thenReturn(new AutoUpdateRepository.WorktreeRegistration(false, null));

        AutoUpdateCandidateBuilder.BuildResult result = builder.prepare(root, SHA);

        assertThat(result.success()).isFalse();
        assertThat(result.error()).contains("Claude sidecar").doesNotContain("目录清理失败");
        assertThat(Files.exists(stage)).isFalse();
        verify(repository).worktreeRegistration(root, stage);
    }

    private static AutoUpdateCommandRunner.Result success() {
        return new AutoUpdateCommandRunner.Result(0, "", "", false, null);
    }
}
