package com.exceptioncoder.toolbox.common.git;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/** 使用真实临时仓库验证原生忽略优先级、准确路径及只读状态查询。 */
class GitStatusReaderTest {
    @TempDir
    Path temporary;

    @Test
    void matchesTrackedPathsWithNestedNegatedLocalAndGlobalRules() throws Exception {
        Path repository = initialize();
        List<String> tracked = List.of("cache/output.tmp", "cache/keep.tmp", "nested/output.tmp",
                "local.txt", "global.tmp", "deleted.log", "src/normal.ts");
        for (String path : tracked) {
            write(repository, path, "before");
        }
        commit(repository);
        write(repository, ".gitignore", "cache/*.tmp\n!cache/keep.tmp\n*.log\n");
        write(repository, "nested/.gitignore", "*.tmp\n");
        write(repository, ".git/info/exclude", "local.txt\n");
        Path globalIgnore = temporary.resolve("global ignore");
        Files.writeString(globalIgnore, "global.tmp\n", StandardCharsets.UTF_8);
        git(repository, "config", "core.excludesFile", globalIgnore.toString());
        for (String path : tracked) {
            if (!path.equals("deleted.log")) {
                write(repository, path, "after");
            }
        }
        git(repository, "rm", "--quiet", "--", "deleted.log");
        write(repository, "cache/untracked.tmp", "already ignored by Git status");
        String before = git(repository, "status", "--porcelain=v1", "-z", "-unormal");

        GitStatusResponse result = new GitLogService(new GitProperties()).gitStatus(repository);

        assertThat(result.ignoredPaths()).containsExactlyInAnyOrder("cache/output.tmp", "nested/output.tmp",
                "local.txt", "global.tmp", "deleted.log");
        assertThat(result.entries()).extracting(GitStatusEntry::path)
                .contains("cache/keep.tmp", "src/normal.ts")
                .doesNotContain("cache/untracked.tmp");
        assertThat(git(repository, "status", "--porcelain=v1", "-z", "-unormal")).isEqualTo(before);
    }

    @Test
    void preservesRenameOriginsSpecialNamesAndCollapsedDirectories() throws Exception {
        Path repository = initialize();
        write(repository, "old.md", "rename me");
        commit(repository);
        String renamed = "文 档 [new].md";
        git(repository, "mv", "--", "old.md", renamed);
        write(repository, ".gitignore", "*.md\n");
        write(repository, "build artifacts/file.txt", "untracked directory");

        GitStatusResponse result = new GitLogService(new GitProperties()).gitStatus(repository);

        assertThat(result.entries()).contains(new GitStatusEntry("R", " ", renamed, "old.md"));
        assertThat(result.entries()).extracting(GitStatusEntry::path).contains("build artifacts/");
        assertThat(result.ignoredPaths()).containsExactly(renamed);
    }

    @Test
    void treatsNoMatchingRuleAndAnEmptyWorktreeAsSuccessfulQueries() throws Exception {
        Path repository = initialize();
        write(repository, "src/normal.ts", "plain");
        GitLogService service = new GitLogService(new GitProperties());

        assertThat(service.gitStatus(repository).ignoredPaths()).isEmpty();
        commit(repository);
        assertThat(service.gitStatus(repository).entries()).isEmpty();
    }

    private Path initialize() throws Exception {
        Path repository = Files.createDirectory(temporary.resolve("repository"));
        git(repository, "init", "--quiet");
        Path globalIgnore = temporary.resolve("empty global ignore");
        Files.writeString(globalIgnore, "", StandardCharsets.UTF_8);
        git(repository, "config", "core.excludesFile", globalIgnore.toString());
        return repository;
    }

    private void write(Path repository, String path, String content) throws IOException {
        Path file = repository.resolve(path);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content, StandardCharsets.UTF_8);
    }

    private void commit(Path repository) throws Exception {
        git(repository, "add", "--all");
        git(repository, "-c", "user.name=Git fixture", "-c", "user.email=fixture@example.invalid",
                "-c", "commit.gpgSign=false", "commit", "--quiet", "-m", "fixture");
    }

    private String git(Path repository, String... arguments) throws Exception {
        List<String> command = new ArrayList<>(List.of("git", "-C", repository.toString()));
        command.addAll(Arrays.asList(arguments));
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        assertThat(process.waitFor(10, TimeUnit.SECONDS)).isTrue();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertThat(process.exitValue()).describedAs("Git fixture command: %s", Arrays.toString(arguments)).isZero();
        return output;
    }
}
