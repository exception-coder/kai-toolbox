package com.exceptioncoder.toolbox.projects.registry.application;

import com.exceptioncoder.toolbox.common.git.GitProperties;
import com.exceptioncoder.toolbox.projects.registry.domain.RegistryProject;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitCommand;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitWorkspaceReader;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ProjectGitWorkspaceServiceTest {
    @TempDir Path temporary;
    private Path root;
    private Path remote;
    private ProjectGitWorkspaceService service;
    private final ProjectGitCommand command = new ProjectGitCommand(new GitProperties());

    @BeforeEach
    void setup() throws Exception {
        root = Files.createDirectory(temporary.resolve("working space"));
        remote = Files.createDirectory(temporary.resolve("remote.git"));
        git(remote, "init", "--bare");
        git(root, "init", "-b", "main");
        git(root, "config", "user.name", "Fixture User");
        git(root, "config", "user.email", "fixture@example.invalid");
        git(root, "config", "commit.gpgsign", "false");
        git(root, "remote", "add", "origin", remote.toString());
        ProjectRegistryService registry = mock(ProjectRegistryService.class);
        when(registry.require("project")).thenReturn(new RegistryProject("project",
                new RegistryProject.Metadata("Fixture", root.toString(), "git", "", "", "", "", ""),
                "UNINITIALIZED", 0, 0L, 0L));
        service = new ProjectGitWorkspaceService(registry, new ProjectGitWorkspaceReader(command), command);
    }

    @Test
    void pushesDisplayedCommitAndPreservesDirtyFiles() throws Exception {
        seedUpstream();
        commit("outgoing.txt", "待推送提交");
        Files.writeString(root.resolve("未提交 文件.txt"), "keep local");
        var before = service.read("project");
        assertThat(before.ahead()).isEqualTo(1);
        assertThat(before.commits()).hasSize(1);
        assertThat(before.commits().getFirst().subject()).isEqualTo("待推送提交");
        service.push("project", before.token());
        assertThat(git(remote, "rev-parse", "refs/heads/main").strip()).isEqualTo(before.head());
        assertThat(Files.readString(root.resolve("未提交 文件.txt"))).isEqualTo("keep local");
        assertThat(service.read("project").ahead()).isZero();
    }

    @Test
    void preservesRenameSpacesAndBothIndexStates() throws Exception {
        seedUpstream();
        git(root, "mv", "seed.txt", "新 名称.txt");
        Files.writeString(root.resolve("新 名称.txt"), "modified after staging");
        Files.writeString(root.resolve("未跟踪.txt"), "new");
        var files = service.read("project").files();
        assertThat(files).anySatisfy(file -> {
            assertThat(file.path()).isEqualTo("新 名称.txt");
            assertThat(file.origPath()).isEqualTo("seed.txt");
            assertThat(file.x()).isEqualTo("R");
            assertThat(file.y()).isEqualTo("M");
        });
        assertThat(files).anySatisfy(file -> {
            assertThat(file.path()).isEqualTo("未跟踪.txt");
            assertThat(file.x()).isEqualTo("?");
        });
    }

    @Test
    void reportsUnbornNoUpstreamAndDetached() throws Exception {
        assertThat(service.read("project").pushBlockedReason()).contains("尚无提交");
        commit("seed.txt", "initial");
        assertThat(service.read("project").pushBlockedReason()).contains("upstream");
        git(root, "checkout", "--detach");
        assertThat(service.read("project").pushBlockedReason()).contains("detached");
    }

    @Test
    void rejectsSnapshotAfterNewCommitOrRemoteChange() throws Exception {
        seedUpstream();
        commit("one.txt", "one");
        var first = service.read("project");
        commit("two.txt", "two");
        assertThatThrownBy(() -> service.push("project", first.token())).hasMessageContaining("已变化");
        var second = service.read("project");
        git(root, "remote", "set-url", "--push", "origin", temporary.resolve("other.git").toString());
        assertThatThrownBy(() -> service.push("project", second.token())).hasMessageContaining("已变化");
    }

    @Test
    void refusesRemoteNonFastForwardWithoutForce() throws Exception {
        seedUpstream();
        Path other = temporary.resolve("other");
        git(temporary, "clone", "-b", "main", remote.toString(), other.toString());
        git(other, "config", "user.name", "Fixture User");
        git(other, "config", "user.email", "fixture@example.invalid");
        git(other, "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "remote advance");
        git(other, "push", "origin", "main");
        String remoteHead = git(remote, "rev-parse", "refs/heads/main").strip();
        commit("local.txt", "local advance");
        var snapshot = service.read("project");
        assertThatThrownBy(() -> service.push("project", snapshot.token())).hasMessageContaining("Git 操作失败");
        assertThat(git(remote, "rev-parse", "refs/heads/main").strip()).isEqualTo(remoteHead);
        git(root, "fetch", "origin");
        assertThat(service.read("project").pushBlockedReason()).contains("落后");
    }

    @Test
    void pushesConfiguredDestinationsAndDoesNotPublishTags() throws Exception {
        seedUpstream();
        commit("one.txt", "one");
        git(root, "tag", "-a", "private-tag", "-m", "local tag");
        git(root, "config", "push.followTags", "true");
        service.push("project", service.read("project").token());
        assertThat(git(remote, "tag", "--list")).isBlank();
        commit("two.txt", "two");
        Path second = Files.createDirectory(temporary.resolve("second.git"));
        git(second, "init", "--bare");
        git(root, "remote", "set-url", "--add", "--push", "origin", remote.toString());
        git(root, "remote", "set-url", "--add", "--push", "origin", second.toString());
        var snapshot = service.read("project");
        assertThat(snapshot.destinations()).hasSize(2);
        assertThat(snapshot.pushBlockedReason()).isEmpty();
        service.push("project", snapshot.token());
        assertThat(git(remote, "rev-parse", "refs/heads/main").strip()).isEqualTo(snapshot.head());
        assertThat(git(second, "rev-parse", "refs/heads/main").strip()).isEqualTo(snapshot.head());
        assertThat(git(second, "tag", "--list")).isBlank();
    }

    @Test
    void reportsPartialSuccessAndAllowsRetryWithoutLosingOutgoingState() throws Exception {
        seedUpstream();
        commit("outgoing.txt", "outgoing");
        Path second = temporary.resolve("missing.git");
        git(root, "remote", "set-url", "--add", "--push", "origin", remote.toString());
        git(root, "remote", "set-url", "--add", "--push", "origin", second.toString());
        var snapshot = service.read("project");
        assertThatThrownBy(() -> service.push("project", snapshot.token()))
                .hasMessageContaining("已成功：目标 1").hasMessageContaining("目标 2");
        assertThat(service.read("project").ahead()).isEqualTo(1);
        git(root, "fetch", "origin");
        assertThat(service.read("project").ahead()).isZero();
        assertThat(service.read("project").pushBlockedReason()).isEmpty();
        Files.createDirectory(second);
        git(second, "init", "--bare");
        service.push("project", service.read("project").token());
        assertThat(service.read("project").ahead()).isZero();
        assertThat(git(second, "rev-parse", "refs/heads/main").strip()).isEqualTo(snapshot.head());
    }

    @Test
    void sanitizesCredentials() {
        assertThat(ProjectGitCommand.sanitize("fatal https://user:secret@host/repo?token=abc password=xyz"))
                .doesNotContain("secret", "abc", "xyz");
    }

    private void seedUpstream() throws Exception {
        commit("seed.txt", "initial");
        git(root, "push", "-u", "origin", "main");
    }

    private void commit(String file, String subject) throws Exception {
        Files.writeString(root.resolve(file), subject);
        git(root, "add", "--", file);
        git(root, "commit", "-m", subject);
    }

    private String git(Path directory, String... arguments) {
        return command.run(directory, Duration.ofSeconds(15), arguments).requireSuccess();
    }
}
