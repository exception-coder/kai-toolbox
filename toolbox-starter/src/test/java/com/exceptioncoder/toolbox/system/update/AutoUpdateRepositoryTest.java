package com.exceptioncoder.toolbox.system.update;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class AutoUpdateRepositoryTest {

    @TempDir
    Path temp;

    private Path remote;
    private Path seed;
    private Path local;
    private AutoUpdateRepository repository;

    @BeforeEach
    void setUp() throws Exception {
        remote = temp.resolve("remote.git");
        seed = temp.resolve("seed");
        local = temp.resolve("local");
        git(temp, "init", "--bare", remote.toString());
        git(temp, "clone", remote.toString(), seed.toString());
        configureUser(seed);
        Files.writeString(seed.resolve("pom.xml"), "<project/>\n");
        Files.writeString(seed.resolve("version.txt"), "one\n");
        git(seed, "add", ".");
        git(seed, "commit", "-m", "initial");
        git(seed, "branch", "-M", "main");
        git(seed, "push", "-u", "origin", "main");
        git(temp, "clone", "--branch", "main", remote.toString(), local.toString());
        configureUser(local);

        AutoUpdateProperties properties = new AutoUpdateProperties();
        properties.setRepository(local.toString());
        properties.setCommandTimeout(Duration.ofSeconds(10));
        properties.setFetchTimeout(Duration.ofSeconds(10));
        properties.setMergeTimeout(Duration.ofSeconds(10));
        AutoUpdateCommandRunner runner = new AutoUpdateCommandRunner(properties);
        repository = new AutoUpdateRepository(properties, runner);
    }

    @Test
    void classifiesCleanBehindAndMergesOnlyValidatedSha() throws Exception {
        String candidate = pushRemoteChange("two");

        assertThat(repository.fetch(local).success()).isTrue();
        AutoUpdateRepository.RepositoryState behind = repository.inspect(local);
        assertThat(behind.disposition()).isEqualTo(AutoUpdateRepository.Disposition.BEHIND);
        assertThat(behind.remoteHead()).isEqualTo(candidate);

        assertThat(repository.mergeImmutable(local, candidate).success()).isTrue();
        AutoUpdateRepository.RepositoryState updated = repository.inspect(local);
        assertThat(updated.disposition()).isEqualTo(AutoUpdateRepository.Disposition.UP_TO_DATE);
        assertThat(updated.localHead()).isEqualTo(candidate);
    }

    @Test
    void blocksTrackedAndUntrackedChangesWithoutChangingHead() throws Exception {
        String original = git(local, "rev-parse", "HEAD").trim();
        Files.writeString(local.resolve("version.txt"), "dirty\n");
        assertThat(repository.inspect(local).disposition()).isEqualTo(AutoUpdateRepository.Disposition.DIRTY);
        assertThat(git(local, "rev-parse", "HEAD").trim()).isEqualTo(original);

        git(local, "restore", "version.txt");
        Files.writeString(local.resolve("untracked.txt"), "dirty\n");
        assertThat(repository.inspect(local).disposition()).isEqualTo(AutoUpdateRepository.Disposition.DIRTY);
        assertThat(git(local, "rev-parse", "HEAD").trim()).isEqualTo(original);
    }

    @Test
    void blocksOperationMarkerAndLocalAhead() throws Exception {
        Path indexLock = Path.of(git(local, "rev-parse", "--git-path", "index.lock").trim());
        if (!indexLock.isAbsolute()) indexLock = local.resolve(indexLock);
        Files.createFile(indexLock);
        assertThat(repository.inspect(local).disposition())
                .isEqualTo(AutoUpdateRepository.Disposition.OPERATION_IN_PROGRESS);
        Files.delete(indexLock);

        Files.writeString(local.resolve("local.txt"), "ahead\n");
        git(local, "add", "local.txt");
        git(local, "commit", "-m", "local ahead");
        assertThat(repository.inspect(local).disposition()).isEqualTo(AutoUpdateRepository.Disposition.AHEAD);
    }

    @Test
    void exactShaMergeDoesNotFollowRemoteRefThatMovedLater() throws Exception {
        String firstCandidate = pushRemoteChange("two");
        assertThat(repository.fetch(local).success()).isTrue();
        assertThat(repository.inspect(local).remoteHead()).isEqualTo(firstCandidate);

        String newerCandidate = pushRemoteChange("three");
        assertThat(repository.fetch(local).success()).isTrue();
        assertThat(repository.mergeImmutable(local, firstCandidate).success()).isTrue();
        assertThat(git(local, "rev-parse", "HEAD").trim()).isEqualTo(firstCandidate);
        assertThat(git(local, "rev-parse", "refs/remotes/origin/main").trim()).isEqualTo(newerCandidate);
        assertThat(repository.inspect(local).disposition()).isEqualTo(AutoUpdateRepository.Disposition.BEHIND);
    }

    @Test
    void distinguishesRegisteredWorktreeFromUnregisteredPartialDirectory() throws Exception {
        String sha = git(local, "rev-parse", "HEAD").trim();
        Path stage = temp.resolve("managed release with spaces").toAbsolutePath();

        assertThat(repository.addDetachedWorktree(local, stage, sha).success()).isTrue();
        assertThat(repository.worktreeRegistration(local, stage).registered()).isTrue();
        assertThat(repository.removeWorktree(local, stage).success()).isTrue();
        Files.createDirectories(stage);

        AutoUpdateRepository.WorktreeRegistration partial = repository.worktreeRegistration(local, stage);
        assertThat(partial.error()).isNull();
        assertThat(partial.registered()).isFalse();
    }

    private String pushRemoteChange(String value) throws Exception {
        Files.writeString(seed.resolve("version.txt"), value + "\n");
        git(seed, "add", "version.txt");
        git(seed, "commit", "-m", value);
        git(seed, "push", "origin", "main");
        return git(seed, "rev-parse", "HEAD").trim();
    }

    private static void configureUser(Path directory) throws Exception {
        git(directory, "config", "user.email", "auto-update-test@example.invalid");
        git(directory, "config", "user.name", "Auto Update Test");
    }

    private static String git(Path directory, String... arguments) throws Exception {
        List<String> command = new ArrayList<>();
        command.add("git");
        command.addAll(List.of(arguments));
        ProcessBuilder builder = new ProcessBuilder(command).directory(directory.toFile()).redirectErrorStream(true);
        builder.environment().putAll(Map.of("GIT_TERMINAL_PROMPT", "0", "GCM_INTERACTIVE", "Never"));
        Process process = builder.start();
        String output = new String(process.getInputStream().readAllBytes());
        if (!process.waitFor(20, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IOException("git timeout: " + command);
        }
        if (process.exitValue() != 0) throw new IOException("git failed " + command + ": " + output);
        return output;
    }
}
