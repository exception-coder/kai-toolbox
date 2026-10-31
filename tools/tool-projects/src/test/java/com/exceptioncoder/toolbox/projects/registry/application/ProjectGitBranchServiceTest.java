package com.exceptioncoder.toolbox.projects.registry.application;

import com.exceptioncoder.toolbox.common.git.GitLogService;
import com.exceptioncoder.toolbox.common.git.GitProperties;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitCommand;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitPullReader;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitWorkspaceReader;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProjectGitBranchServiceTest {
    @TempDir Path temporary;
    private Path root;
    private final ProjectGitCommand command = new ProjectGitCommand(new GitProperties());
    private final ProjectGitBranchService service = new ProjectGitBranchService(new ProjectGitWorkspaceReader(command),
            new ProjectGitPullReader(command), command, new ProjectGitMutationLock(), new GitLogService(new GitProperties()));

    @BeforeEach
    void setup() throws Exception {
        root = Files.createDirectory(temporary.resolve("working space"));
        git(root, "init", "-b", "main");
        git(root, "config", "user.name", "Fixture User");
        git(root, "config", "user.email", "fixture@example.invalid");
        Files.writeString(root.resolve("seed.txt"), "seed");
        git(root, "add", ".");
        git(root, "commit", "-m", "seed");
        git(root, "branch", "release/long-branch-name");
    }

    @Test
    void switchesLocalBranchOnlyAfterRecheckingCleanSnapshot() throws Exception {
        var snapshot = service.prepareSwitch(root, "refs/heads/release/long-branch-name");
        Files.writeString(root.resolve("untracked.txt"), "keep");
        assertThatThrownBy(() -> service.switchBranch(root, snapshot.ref(), snapshot.token())).hasMessageContaining("未提交");
        assertThat(git(root, "branch", "--show-current").strip()).isEqualTo("main");
        assertThat(Files.readString(root.resolve("untracked.txt"))).isEqualTo("keep");
        Files.delete(root.resolve("untracked.txt"));
        assertThat(service.switchBranch(root, snapshot.ref(), snapshot.token())).contains("已切换到");
        assertThat(git(root, "branch", "--show-current").strip()).isEqualTo("release/long-branch-name");
    }

    @Test
    void rejectsChangedTargetAndUnfinishedMerge() throws Exception {
        var snapshot = service.prepareSwitch(root, "refs/heads/release/long-branch-name");
        git(root, "commit", "--allow-empty", "-m", "new target");
        git(root, "branch", "-f", "release/long-branch-name", "HEAD");
        assertThatThrownBy(() -> service.switchBranch(root, snapshot.ref(), snapshot.token())).hasMessageContaining("已变化");
        Files.writeString(root.resolve(".git/MERGE_HEAD"), snapshot.head());
        assertThatThrownBy(() -> service.prepareSwitch(root, snapshot.ref())).hasMessageContaining("未完成");
        Files.delete(root.resolve(".git/MERGE_HEAD"));
        git(root, "checkout", "--detach");
        assertThatThrownBy(() -> service.prepareSwitch(root, snapshot.ref())).hasMessageContaining("游离 HEAD");
    }

    @Test
    void fetchChecksRemoteWithoutChangingDirtyWorkingFilesAndRemoteBranchTracksOnConfirmation() throws Exception {
        Path remote = Files.createDirectory(temporary.resolve("remote.git"));
        git(remote, "init", "--bare");
        git(root, "remote", "add", "origin", remote.toString());
        git(root, "push", "-u", "origin", "main");
        git(root, "push", "origin", "main:refs/heads/remote-feature");
        assertThat(service.status(root, false).remoteChecked()).isFalse();
        Files.writeString(root.resolve("seed.txt"), "local work");
        assertThat(service.status(root, true).remoteChecked()).isTrue();
        assertThat(Files.readString(root.resolve("seed.txt"))).isEqualTo("local work");
        git(root, "restore", "seed.txt");
        var snapshot = service.prepareSwitch(root, "refs/remotes/origin/remote-feature");
        assertThat(snapshot.localBranch()).isEqualTo("remote-feature");
        assertThat(snapshot.tracking()).isEqualTo("origin/remote-feature");
        service.switchBranch(root, snapshot.ref(), snapshot.token());
        assertThat(git(root, "rev-parse", "--abbrev-ref", "@{upstream}").strip()).isEqualTo("origin/remote-feature");
        git(root, "checkout", "main");
        assertThatThrownBy(() -> service.prepareSwitch(root, snapshot.ref())).hasMessageContaining("同名本地分支");
        git(root, "remote", "set-url", "origin", temporary.resolve("missing.git").toString());
        assertThat(service.status(root, true).remoteChecked()).isFalse();
        assertThat(service.status(root, false).notice()).contains("尚未核对");
    }

    @Test
    void refusesToOverwriteIgnoredFilesOnCheckout() throws Exception {
        git(root, "checkout", "release/long-branch-name");
        Files.writeString(root.resolve("important.txt"), "tracked on target");
        git(root, "add", "important.txt");
        git(root, "commit", "-m", "target file");
        git(root, "checkout", "main");
        Files.writeString(root.resolve(".git/info/exclude"), "important.txt\n");
        Files.writeString(root.resolve("important.txt"), "local ignored data");
        var snapshot = service.prepareSwitch(root, "refs/heads/release/long-branch-name");
        assertThatThrownBy(() -> service.switchBranch(root, snapshot.ref(), snapshot.token())).hasMessageContaining("Git 操作失败");
        assertThat(Files.readString(root.resolve("important.txt"))).isEqualTo("local ignored data");
        assertThat(git(root, "branch", "--show-current").strip()).isEqualTo("main");
    }

    private String git(Path directory, String... args) {
        return command.run(directory, Duration.ofSeconds(15), args).requireSuccess();
    }
}
