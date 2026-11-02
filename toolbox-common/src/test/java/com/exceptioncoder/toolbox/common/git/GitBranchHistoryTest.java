package com.exceptioncoder.toolbox.common.git;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;

class GitBranchHistoryTest {
    @TempDir Path directory;
    final GitLogService service = new GitLogService(new GitProperties());

    @Test void readsLocalAndCachedRemoteHistoryWithoutChangingHeadIndexOrFiles() throws Exception {
        init(); commit("base");
        git("switch", "-c", "feature"); commit("feature-change");
        git("update-ref", "refs/remotes/origin/feature", "HEAD");
        git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/feature");
        git("switch", "main");
        Files.writeString(directory.resolve("work.txt"), "unfinished");
        git("add", "work.txt");
        Files.writeString(directory.resolve("work.txt"), "still editing");
        String head = git("rev-parse", "HEAD");
        String status = git("status", "--porcelain=v1");
        String index = git("diff", "--cached");
        assertThat(service.listBranches(directory)).extracting(GitBranchRef::ref)
                .contains("refs/heads/main", "refs/heads/feature", "refs/remotes/origin/feature")
                .doesNotContain("refs/remotes/origin/HEAD");
        assertThat(service.listBranches(directory).getFirst().current()).isTrue();
        assertThat(service.listCommits(directory, 50, "refs/heads/main")).extracting(CommitInfo::subject).containsExactly("base");
        assertThat(service.listCommits(directory, 1, "refs/remotes/origin/feature")).extracting(CommitInfo::subject).containsExactly("feature-change");
        for (String invalid : List.of("--all", "HEAD~1", "refs/heads/main..refs/heads/feature", "refs/heads/deleted")) {
            assertThatThrownBy(() -> service.listCommits(directory, 50, invalid)).isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(git("rev-parse", "HEAD")).isEqualTo(head);
        assertThat(git("status", "--porcelain=v1")).isEqualTo(status);
        assertThat(git("diff", "--cached")).isEqualTo(index);
        assertThat(Files.readString(directory.resolve("work.txt"))).isEqualTo("still editing");
    }

    @Test void representsUnbornBranchesAndDetachedHeadExplicitly() throws Exception {
        init();
        assertThat(service.listBranches(directory)).containsExactly(new GitBranchRef("refs/heads/main", "main", "", true, false));
        assertThat(service.listCommits(directory, 50, "refs/heads/main")).isEmpty();
        commit("first");
        git("switch", "--detach");
        assertThat(service.listBranches(directory).getFirst().ref()).isEqualTo("HEAD");
        assertThat(service.listCommits(directory, 50, "HEAD")).extracting(CommitInfo::subject).containsExactly("first");
    }

    @Test void pagesOneFixedBranchVersionAndRejectsMixedHistory() throws Exception {
        init(); commit("first"); commit("second"); commit("third");
        String head = git("rev-parse", "HEAD").strip();
        assertThat(service.listCommitsPage(directory, 1, "refs/heads/main", 1, head))
                .extracting(CommitInfo::subject).containsExactly("second");
        commit("fourth");
        assertThatThrownBy(() -> service.listCommitsPage(directory, 1, "refs/heads/main", 2, head))
                .hasMessageContaining("已变化");
    }

    @Test void identifiesConfiguredRemotePrefixesAndComparesIndependentHistories() throws Exception {
        init(); commit("base");
        git("remote", "add", "team/origin", directory.toString());
        git("remote", "add", "gitee", directory.toString());
        git("switch", "-c", "remote-work"); commit("remote-change"); commit("second-remote-change");
        git("update-ref", "refs/remotes/team/origin/main", "HEAD");
        git("switch", "main"); commit("local-change");
        git("update-ref", "refs/remotes/gitee/main", "HEAD");
        git("branch", "--set-upstream-to=team/origin/main", "main");
        var refs = service.listBranches(directory);
        assertThat(refs).filteredOn(value -> value.ref().equals("refs/remotes/team/origin/main"))
                .singleElement().satisfies(value -> {
                    assertThat(value.remoteName()).isEqualTo("team/origin");
                    assertThat(value.logicalName()).isEqualTo("main");
                });
        assertThat(refs).filteredOn(GitBranchRef::current).singleElement()
                .extracting(GitBranchRef::upstream).isEqualTo("refs/remotes/team/origin/main");
        String before = git("status", "--porcelain=v1");
        var diverged = service.compareBranches(directory, "refs/heads/main", "refs/remotes/team/origin/main");
        assertThat(diverged.ahead()).isEqualTo(1);
        assertThat(diverged.behind()).isEqualTo(2);
        var equal = service.compareBranches(directory, "refs/heads/main", "refs/remotes/gitee/main");
        assertThat(equal.ahead()).isZero(); assertThat(equal.behind()).isZero();
        assertThatThrownBy(() -> service.compareBranches(directory, "refs/heads/main", "HEAD~1"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(git("status", "--porcelain=v1")).isEqualTo(before);
        assertThat(git("branch", "--show-current").strip()).isEqualTo("main");
    }

    void init() throws Exception {
        git("init", "-b", "main"); git("config", "user.name", "Worker"); git("config", "user.email", "worker@example.test");
    }

    void commit(String subject) throws Exception {
        Files.writeString(directory.resolve("work.txt"), subject);
        git("add", "work.txt"); git("commit", "-m", subject);
    }

    String git(String... arguments) throws Exception {
        var command = new ArrayList<>(List.of("git", "-C", directory.toString()));
        command.addAll(List.of(arguments));
        var process = new ProcessBuilder(command).redirectErrorStream(true).start();
        assertThat(process.waitFor(10, TimeUnit.SECONDS)).isTrue();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertThat(process.exitValue()).withFailMessage(output).isZero();
        return output;
    }
}
