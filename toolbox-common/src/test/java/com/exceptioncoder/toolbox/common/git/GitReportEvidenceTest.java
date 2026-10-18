package com.exceptioncoder.toolbox.common.git;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.*;

class GitReportEvidenceTest {
    @TempDir Path directory;

    @Test void selectsExactAuthorAndCommitterDateWithoutChangingTheWorkingTree() throws Exception {
        git("init"); git("config", "user.name", "Worker"); git("config", "user.email", "worker@example.test");
        commit("first", "worker@example.test", "2026-10-11T16:00:00Z");
        commit("other", "other@example.test", "2026-10-12T16:00:00Z");
        commit("after", "worker@example.test", "2026-10-18T16:00:00Z");
        var service = new GitLogService(new GitProperties());
        String evidence = service.readReportEvidence(directory, Instant.parse("2026-10-11T16:00:00Z"),
                Instant.parse("2026-10-18T16:00:00Z"), "worker@example.test");
        assertThat(evidence).contains("first").doesNotContain("other", "after");
        assertThat(service.repositoryRoot(directory)).isEqualTo(directory.toAbsolutePath());
        assertThat(git("status", "--porcelain")).isBlank();
    }

    void commit(String title, String email, String date) throws Exception {
        Files.writeString(directory.resolve("test.txt"), title);
        git("add", "test.txt");
        List<String> args = new ArrayList<>(List.of("git", "-C", directory.toString(), "commit", "-m", title));
        var builder = new ProcessBuilder(args).redirectErrorStream(true);
        builder.environment().put("GIT_AUTHOR_NAME", "Worker");
        builder.environment().put("GIT_AUTHOR_EMAIL", email);
        builder.environment().put("GIT_AUTHOR_DATE", "2025-01-01T00:00:00Z");
        builder.environment().put("GIT_COMMITTER_DATE", date);
        var process = builder.start();
        assertThat(process.waitFor(10, TimeUnit.SECONDS)).isTrue();
        assertThat(process.exitValue()).isZero();
    }

    String git(String... arguments) throws Exception {
        var args = new ArrayList<>(List.of("git", "-C", directory.toString()));
        args.addAll(List.of(arguments));
        var process = new ProcessBuilder(args).redirectErrorStream(true).start();
        assertThat(process.waitFor(10, TimeUnit.SECONDS)).isTrue();
        String result = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        assertThat(process.exitValue()).withFailMessage(result).isZero();
        return result;
    }
}
