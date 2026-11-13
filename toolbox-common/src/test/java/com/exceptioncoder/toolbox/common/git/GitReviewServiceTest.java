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

class GitReviewServiceTest {
    @TempDir Path root;
    GitReviewService review() { return new GitReviewService(new GitLogService(new GitProperties()), path -> !path.toString().contains("excluded")); }

    @Test void initialCommitDeletionRenameAndUnicodeRemainReadOnly() throws Exception {
        init();
        Files.createDirectory(root.resolve("src"));
        write("src/旧 名.java", "class Example {}\n".repeat(30)); write("deleted.txt", "old deleted content\n"); write("modified.txt", "old\n");
        commit("first"); String first = git("rev-parse", "HEAD").strip();
        assertThat(review().changes(root, first).files()).allMatch(file -> file.status().equals("A"));
        assertThat(review().source(root, first, "src/旧 名.java").after()).contains("Example");
        git("mv", "src/旧 名.java", "src/新 名.java"); git("rm", "deleted.txt");
        write("modified.txt", "new\n"); write("added.txt", "new file\n"); commit("second");
        String second = git("rev-parse", "HEAD").strip();
        byte[] index = Files.readAllBytes(root.resolve(".git/index"));
        var changes = review().changes(root, second);
        assertThat(changes.files()).extracting(GitReviewService.Change::status).contains("A", "D", "M", "R");
        assertThat(review().difference(root, second, "deleted.txt", "combined").before()).isEqualTo("old deleted content\n");
        assertThat(review().difference(root, second, "deleted.txt", "combined").after()).isEmpty();
        assertThat(review().difference(root, second, "src/新 名.java", "combined").before()).contains("Example");
        assertThat(changes.files().stream().filter(file -> file.status().equals("R")).findFirst().orElseThrow().oldPath()).isEqualTo("src/旧 名.java");
        assertThat(review().tree(root, second, "src", 0).entries()).extracting(GitReviewService.Entry::name).containsExactly("新 名.java");
        assertThat(review().history(root, "HEAD", 0).commits()).extracting(CommitInfo::subject).containsExactly("second", "first");
        write("untracked.txt", "draft");
        assertThat(review().history(root, first, 0).commits()).extracting(CommitInfo::subject).containsExactly("first");
        assertThat(review().tree(root, first, "", 0).entries()).noneMatch(file -> file.path().equals("untracked.txt"));
        assertThat(Files.readAllBytes(root.resolve(".git/index"))).isEqualTo(index);
        assertThat(git("rev-parse", "HEAD").strip()).isEqualTo(second);
        assertThat(Files.readString(root.resolve("untracked.txt"))).isEqualTo("draft");
    }

    @Test void comparesIndexWorktreeUntrackedAndUnbornWithoutConflatingLayers() throws Exception {
        init(); write("draft.txt", "untracked\n");
        assertThat(review().tree(root, "HEAD", "", 0).entries()).isEmpty();
        assertThat(review().history(root, "HEAD", 0).commits()).isEmpty();
        assertThat(review().difference(root, "WORKTREE", "draft.txt", "combined").after()).isEqualTo("untracked\n");
        commit("first"); write("draft.txt", "staged\n"); git("add", "draft.txt"); write("draft.txt", "unstaged\n");
        byte[] index = Files.readAllBytes(root.resolve(".git/index"));
        var staged = review().difference(root, "WORKTREE", "draft.txt", "index");
        var working = review().difference(root, "WORKTREE", "draft.txt", "worktree");
        assertThat(staged.before()).isEqualTo("untracked\n"); assertThat(staged.after()).isEqualTo("staged\n");
        assertThat(working.before()).isEqualTo("staged\n"); assertThat(working.after()).isEqualTo("unstaged\n");
        assertThat(review().workspace(root, "combined").files().getFirst()).satisfies(file -> { assertThat(file.x()).isEqualTo("M"); assertThat(file.y()).isEqualTo("M"); });
        assertThat(Files.readAllBytes(root.resolve(".git/index"))).isEqualTo(index);
    }

    @Test void branchesAndCommitMessagesAreReadWithoutSwitchingTheWorkspace() throws Exception {
        init(); write("story.txt", "first\n"); git("add", "story.txt");
        git("commit", "-m", "initial", "-m", "Detailed commit body");
        String first = git("rev-parse", "HEAD").strip();
        git("branch", "feature/example", first);
        write("story.txt", "second\n"); commit("next");
        String current = git("rev-parse", "HEAD").strip();
        byte[] index = Files.readAllBytes(root.resolve(".git/index"));

        var branch = review().branches(root).stream().filter(item -> item.name().equals("feature/example")).findFirst().orElseThrow();
        assertThat(branch.head()).isEqualTo(first);
        assertThat(review().history(root, branch.head(), 0).commits()).extracting(CommitInfo::subject).containsExactly("initial");
        assertThat(review().commit(root, first).body()).isEqualTo("Detailed commit body");
        assertThatThrownBy(() -> review().commit(root, "HEAD~1")).isInstanceOf(IllegalArgumentException.class);
        assertThat(git("branch", "--show-current").strip()).isEqualTo("main");
        assertThat(git("rev-parse", "HEAD").strip()).isEqualTo(current);
        assertThat(Files.readAllBytes(root.resolve(".git/index"))).isEqualTo(index);
    }

    @Test void rejectsTraversalRevisionExpressionsAndExcludedPaths() throws Exception {
        init(); write("safe.txt", "safe"); write("excluded.txt", "hidden"); commit("first");
        for (String path : List.of("../outside", ".git/config", "C:/outside", "/etc/passwd", "a/../safe.txt", "file:stream", "a\\b")) {
            assertThatThrownBy(() -> review().source(root, "HEAD", path)).isInstanceOf(IllegalArgumentException.class);
        }
        for (String ref : List.of("--all", "HEAD~1", "main", "HEAD:config")) {
            assertThatThrownBy(() -> review().tree(root, ref, "", 0)).isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(review().tree(root, "HEAD", "", 0).entries()).noneMatch(file -> file.path().equals("excluded.txt"));
        assertThatThrownBy(() -> review().source(root, "HEAD", "excluded.txt")).hasMessageContaining("排除");
        assertThatThrownBy(() -> review().difference(root, "HEAD", "missing.txt", "combined")).hasMessageContaining("没有此变更文件");
    }

    @Test void largeAndBinaryFilesAreExplicitAndDirectoryPagesAreBounded() throws Exception {
        init();
        write("large.txt", "a".repeat(512 * 1024 + 1));
        Files.write(root.resolve("binary.bin"), new byte[] {0, 1, 2});
        for (int i = 0; i < 301; i++) write("item-" + i + ".txt", "small");
        commit("first");
        assertThat(review().source(root, "HEAD", "large.txt").notice()).contains("512 KiB");
        assertThat(review().source(root, "HEAD", "large.txt").after()).isEmpty();
        assertThat(review().source(root, "HEAD", "binary.bin").notice()).contains("二进制");
        var first = review().tree(root, "HEAD", "", 0);
        assertThat(first.hasMore()).isTrue(); assertThat(first.entries()).hasSize(300);
        var next = review().tree(root, first.ref(), "", 300);
        assertThat(next.hasMore()).isFalse(); assertThat(next.entries()).hasSize(3);
    }

    @Test void compactWorkspaceLoadsUntrackedDirectoriesOnDemandAndRespectsIgnore() throws Exception {
        init(); write(".gitignore", "drafts/ignored.txt\n"); write("tracked.txt", "base\n"); commit("first");
        write("tracked.txt", "changed\n");
        Files.createDirectory(root.resolve("drafts"));
        Files.createDirectory(root.resolve("drafts/nested"));
        write("drafts/nested/note.txt", "note"); write("drafts/ignored.txt", "ignored");
        for (int i = 0; i < 160; i++) write("drafts/item-" + String.format("%03d", i) + ".txt", "draft");
        byte[] index = Files.readAllBytes(root.resolve(".git/index"));
        var compact = review().workspace(root, "combined", true);
        assertThat(compact.files()).extracting(GitReviewService.Change::path).contains("tracked.txt", "drafts/");
        assertThat(compact.files()).noneMatch(file -> file.path().startsWith("drafts/item-"));
        var first = review().untrackedDirectory(root, "drafts", 0);
        var second = review().untrackedDirectory(root, "drafts", 150);
        assertThat(first.hasMore()).isTrue(); assertThat(second.hasMore()).isFalse();
        assertThat(java.util.stream.Stream.concat(first.entries().stream(), second.entries().stream()).map(GitReviewService.Entry::path))
                .doesNotContain("drafts/ignored.txt").contains("drafts/item-000.txt", "drafts/item-159.txt", "drafts/nested");
        assertThat(review().untrackedDirectory(root, "drafts/nested", 0).entries()).extracting(GitReviewService.Entry::name).containsExactly("note.txt");
        assertThat(review().difference(root, "WORKTREE", "drafts/nested/note.txt", "combined").after()).isEqualTo("note");
        assertThatThrownBy(() -> review().untrackedDirectory(root, "../outside", 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> review().untrackedDirectory(root, "tracked.txt", 0)).isInstanceOf(IllegalArgumentException.class);
        assertThat(Files.readAllBytes(root.resolve(".git/index"))).isEqualTo(index);
    }

    @Test void selectedWorkspaceRenameKeepsTheOriginalContents() throws Exception {
        init(); write("old.txt", "original content\n"); commit("first"); git("mv", "old.txt", "new.txt");
        var staged = review().difference(root, "WORKTREE", "new.txt", "index");
        assertThat(staged.before()).isEqualTo("original content\n");
        assertThat(staged.after()).isEqualTo("original content\n");
        assertThat(staged.status()).isEqualTo("R");
    }

    private void init() throws Exception { git("init", "--initial-branch=main"); git("config", "user.name", "Review Fixture"); git("config", "user.email", "fixture@example.invalid"); }
    private void write(String path, String value) throws Exception { Files.writeString(root.resolve(path), value, StandardCharsets.UTF_8); }
    private void commit(String message) throws Exception { git("add", "--all"); git("commit", "-m", message); }
    private String git(String... args) throws Exception {
        var command = new ArrayList<>(List.of("git", "--no-optional-locks", "-C", root.toString())); command.addAll(List.of(args));
        var process = new ProcessBuilder(command).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertThat(process.waitFor(15, TimeUnit.SECONDS)).isTrue();
        assertThat(process.exitValue()).as(output).isZero(); return output;
    }
}
