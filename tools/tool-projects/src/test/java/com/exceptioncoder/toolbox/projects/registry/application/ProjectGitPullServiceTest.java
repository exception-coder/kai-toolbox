package com.exceptioncoder.toolbox.projects.registry.application;

import com.exceptioncoder.toolbox.common.git.GitProperties;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitCommand;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitPullReader;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProjectGitPullServiceTest {
    @TempDir Path temporary;
    private Path root;
    private Path remote;
    private Path colleague;
    private ProjectGitPullService service;
    private final ProjectGitCommand command = new ProjectGitCommand(new GitProperties());
    private final ProjectGitMutationLock mutations = new ProjectGitMutationLock();

    @BeforeEach
    void setup() throws Exception {
        root = Files.createDirectory(temporary.resolve("working space"));
        remote = Files.createDirectory(temporary.resolve("remote.git"));
        colleague = temporary.resolve("colleague");
        git(remote, "init", "--bare");
        git(root, "init", "-b", "main");
        identity(root);
        Files.writeString(root.resolve("seed.txt"), "original");
        git(root, "add", "seed.txt");
        git(root, "commit", "-m", "initial");
        git(root, "remote", "add", "origin", remote.toString());
        git(root, "push", "-u", "origin", "main");
        git(temporary, "clone", "-b", "main", remote.toString(), colleague.toString());
        identity(colleague);
        service = new ProjectGitPullService(new ProjectGitPullReader(command), command, mutations);
    }

    @Test
    void fetchesBeforePreviewAndOnlyUpdatesFilesAfterConfirmation() throws Exception {
        advanceRemote();
        String original = git(root, "rev-parse", "HEAD").strip();
        var preview = service.prepare(root);
        assertThat(preview.behind()).isEqualTo(1);
        assertThat(preview.pullBlockedReason()).isEmpty();
        assertThat(git(root, "rev-parse", "HEAD").strip()).isEqualTo(original);
        assertThat(Files.readString(root.resolve("seed.txt"))).isEqualTo("original");
        assertThat(service.pull(root, preview.token())).contains("拉取成功", "1 个提交");
        assertThat(Files.readString(root.resolve("seed.txt"))).isEqualTo("remote update");
        assertThat(git(root, "rev-parse", "HEAD").strip()).isEqualTo(preview.upstreamHead());
        assertThatThrownBy(() -> service.pull(root, preview.token())).hasMessageContaining("已变化");
        assertThat(service.prepare(root).pullBlockedReason()).contains("已是最新");
        assertThat(git(root, "tag", "--list")).isBlank();
    }

    @Test
    void refusesDivergenceWithoutCreatingMergeOrRewritingCommits() throws Exception {
        advanceRemote();
        git(root, "commit", "--allow-empty", "-m", "local");
        String head = git(root, "rev-parse", "HEAD").strip();
        var preview = service.prepare(root);
        assertThat(preview.ahead()).isEqualTo(1);
        assertThat(preview.pullBlockedReason()).contains("分叉");
        assertThatThrownBy(() -> service.pull(root, preview.token())).hasMessageContaining("分叉");
        assertThat(git(root, "rev-parse", "HEAD").strip()).isEqualTo(head);
    }

    @Test
    void neverOverwritesIgnoredLocalFilesIntroducedByUpstream() throws Exception {
        Files.writeString(root.resolve(".git/info/exclude"), "local-only.txt\n");
        Files.writeString(root.resolve("local-only.txt"), "private local content");
        Files.writeString(colleague.resolve("local-only.txt"), "remote content");
        git(colleague, "add", "local-only.txt");
        git(colleague, "commit", "-m", "new tracked file");
        git(colleague, "push", "origin", "main");
        var preview = service.prepare(root);
        assertThatThrownBy(() -> service.pull(root, preview.token())).hasMessageContaining("Git 操作失败");
        assertThat(Files.readString(root.resolve("local-only.txt"))).isEqualTo("private local content");
        assertThat(git(root, "rev-parse", "HEAD").strip()).isEqualTo(preview.head());
    }

    @Test
    void protectsDirtyStagedAndUntrackedFilesEvenWithAutostashEnabled() throws Exception {
        advanceRemote();
        var preview = service.prepare(root);
        git(root, "config", "merge.autostash", "true");
        Files.writeString(root.resolve("seed.txt"), "local draft");
        assertThatThrownBy(() -> service.pull(root, preview.token())).hasMessageContaining("未提交");
        git(root, "add", "seed.txt");
        assertThatThrownBy(() -> service.prepare(root)).hasMessageContaining("未提交");
        assertThat(Files.readString(root.resolve("seed.txt"))).isEqualTo("local draft");
        assertThat(git(root, "stash", "list")).isBlank();
        git(root, "reset", "--", "seed.txt");
        git(root, "restore", "seed.txt");
        Files.writeString(root.resolve("new draft.txt"), "keep");
        assertThatThrownBy(() -> service.prepare(root)).hasMessageContaining("未跟踪");
        assertThat(Files.readString(root.resolve("new draft.txt"))).isEqualTo("keep");
    }

    @Test
    void invalidatesPreviewWhenHeadRemoteOrFetchedVersionChanges() throws Exception {
        advanceRemote();
        var preview = service.prepare(root);
        git(root, "commit", "--allow-empty", "-m", "new local");
        assertThatThrownBy(() -> service.pull(root, preview.token())).hasMessageContaining("已变化");
        git(root, "reset", "--hard", preview.head());
        git(root, "remote", "set-url", "origin", temporary.resolve("another.git").toString());
        assertThatThrownBy(() -> service.pull(root, preview.token())).hasMessageContaining("已变化");
        git(root, "remote", "set-url", "origin", remote.toString());
        git(colleague, "commit", "--allow-empty", "-m", "new remote");
        git(colleague, "push", "origin", "main");
        git(root, "fetch", "origin");
        assertThatThrownBy(() -> service.pull(root, preview.token())).hasMessageContaining("已变化");
    }

    @Test
    void reportsMissingUpstreamDetachedAndUnfinishedIntegration() throws Exception {
        git(root, "branch", "--unset-upstream");
        assertThatThrownBy(() -> service.prepare(root)).hasMessageContaining("upstream");
        git(root, "branch", "--set-upstream-to=origin/main");
        git(root, "checkout", "--detach");
        assertThatThrownBy(() -> service.prepare(root)).hasMessageContaining("detached");
        git(root, "checkout", "main");
        Files.createDirectory(root.resolve(".git/rebase-merge"));
        assertThatThrownBy(() -> service.prepare(root)).hasMessageContaining("未完成");
    }

    @Test
    void sharesCanonicalLockWithPushAndReleasesAfterFailure() throws Exception {
        mutations.execute(root, () -> {
            assertThatThrownBy(() -> service.prepare(root.resolve("."))).hasMessageContaining("正在");
            var push = new ProjectGitWorkspaceService(null,
                    new com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitWorkspaceReader(command),
                    command, mutations);
            assertThatThrownBy(() -> push.push(root, "token")).hasMessageContaining("正在");
            return null;
        });
        git(root, "remote", "set-url", "origin", temporary.resolve("missing.git").toString());
        assertThatThrownBy(() -> service.prepare(root)).hasMessageContaining("Git 操作失败");
        git(root, "remote", "set-url", "origin", remote.toString());
        assertThat(service.prepare(root).behind()).isZero();
    }

    private void advanceRemote() throws Exception {
        Files.writeString(colleague.resolve("seed.txt"), "remote update");
        git(colleague, "add", "seed.txt");
        git(colleague, "commit", "-m", "remote update");
        git(colleague, "tag", "private-tag");
        git(colleague, "push", "origin", "main", "--tags");
    }

    private void identity(Path directory) {
        git(directory, "config", "user.name", "Fixture User");
        git(directory, "config", "user.email", "fixture@example.invalid");
        git(directory, "config", "commit.gpgsign", "false");
    }

    private String git(Path directory, String... arguments) {
        return command.run(directory, Duration.ofSeconds(15), arguments).requireSuccess();
    }
}
