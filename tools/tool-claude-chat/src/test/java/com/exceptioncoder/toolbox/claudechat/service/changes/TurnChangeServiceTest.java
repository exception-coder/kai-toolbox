package com.exceptioncoder.toolbox.claudechat.service.changes;

import com.exceptioncoder.toolbox.claudechat.api.dto.GitRepoRefView;
import com.exceptioncoder.toolbox.claudechat.repository.TurnChangeRepository;
import com.exceptioncoder.toolbox.claudechat.service.SessionGitRepositoryService;
import com.exceptioncoder.toolbox.common.git.GitLogService;
import com.exceptioncoder.toolbox.common.git.GitProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class TurnChangeServiceTest {
    @TempDir Path root;
    TurnChangeService service;
    TurnChangeRepository records;
    SessionGitRepositoryService repos;
    SingleConnectionDataSource dataSource;
    @BeforeEach void setup() throws Exception {
        git("init", "--initial-branch=main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.invalid");
        Files.writeString(root.resolve("old.txt"), "base"); Files.writeString(root.resolve("中文 file.txt"), "base");
        git("add", "old.txt", "中文 file.txt"); git("commit", "-m", "baseline");
        dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("PRAGMA foreign_keys=ON");
        jdbc.execute("CREATE TABLE claude_chat_session(id TEXT PRIMARY KEY)");
        jdbc.update("INSERT INTO claude_chat_session(id) VALUES('s1'),('s2')");
        String ddl;
        try (var input = getClass().getResourceAsStream("/db/claude-chat-turn-change-schema.sql")) {
            ddl = new String(Objects.requireNonNull(input).readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
        for (int repeat = 0; repeat < 2; repeat++) for (String statement : ddl.split(";")) if (!statement.isBlank()) jdbc.execute(statement);
        records = new TurnChangeRepository(jdbc, new ObjectMapper());
        repos = mock(SessionGitRepositoryService.class);
        when(repos.list(anyString())).thenReturn(List.of(new GitRepoRefView("", "测试仓库", true)));
        when(repos.resolve(anyString(), eq(""))).thenReturn(root);
        service = new TurnChangeService(repos, new GitLogService(new GitProperties()), records);
    }
    @AfterEach void close() { dataSource.destroy(); }
    @Test void excludesUnchangedDirtyFilesAndPersistsCommittedChanges() throws Exception {
        Files.writeString(root.resolve("old.txt"), "pre-existing"); service.begin("s1", "t1");
        Files.writeString(root.resolve("中文 file.txt"), "new"); git("add", "中文 file.txt"); git("commit", "-m", "turn change");
        service.finish("s1", "t1", "end_turn");
        var record = records.find("s1", "t1").orElseThrow();
        assertThat(record.state()).isEqualTo("COMPLETE");
        assertThat(record.repositories().getFirst().files()).extracting(TurnChangeRecord.FileChange::path).containsExactly("中文 file.txt");
        Files.writeString(root.resolve("old.txt"), "later"); service.finish("s1", "t1", "error");
        assertThat(records.find("s1", "t1")).contains(record);
        assertThat(service.list("s2", "", "", 0)).isEmpty();
        assertThat(service.list("s1", "中文", "", 0)).hasSize(1);
    }
    @Test void catchesNewFilesDirtyEditsDeletesAndRenames() throws Exception {
        Files.writeString(root.resolve("deleted.txt"), "tracked"); git("add", "deleted.txt"); git("commit", "-m", "deletion fixture");
        Files.writeString(root.resolve("old.txt"), "dirty"); service.begin("s1", "t2");
        Files.writeString(root.resolve("old.txt"), "dirty again"); Files.writeString(root.resolve("new.txt"), "new");
        Files.delete(root.resolve("deleted.txt"));
        git("mv", "中文 file.txt", "renamed file.txt");
        service.finish("s1", "t2", "interrupted");
        var files = records.find("s1", "t2").orElseThrow().repositories().getFirst().files();
        assertThat(files).extracting(TurnChangeRecord.FileChange::path).contains("old.txt", "new.txt", "renamed file.txt");
        assertThat(files.stream().filter(file -> file.path().equals("deleted.txt")).findFirst().orElseThrow().status()).isEqualTo("D");
        assertThat(files.stream().filter(file -> file.path().equals("renamed file.txt")).findFirst().orElseThrow().originalPath()).isEqualTo("中文 file.txt");
    }
    @Test void marksPartialAndPreservesUnsettledBaseline() throws Exception {
        Files.write(root.resolve("huge.bin"), new byte[9 * 1024 * 1024]); service.begin("s1", "t3");
        assertThat(records.find("s1", "t3").orElseThrow().state()).isEqualTo("RUNNING");
        service.finish("s1", "t3", "error");
        assertThat(records.find("s1", "t3").orElseThrow().state()).isEqualTo("PARTIAL");
        assertThat(records.find("s1", "t3").orElseThrow().warnings()).isNotEmpty();
    }
    @Test void paginatesLiteralSearchAndKeepsPreexistingCommitEvidence() throws Exception {
        Files.writeString(root.resolve("old.txt"), "dirty"); service.begin("s1", "t4");
        git("add", "old.txt"); git("commit", "-m", "existing content"); service.finish("s1", "t4", "end_turn");
        assertThat(records.find("s1", "t4").orElseThrow().repositories().getFirst().files().getFirst().source()).isEqualTo("COMMIT_PREEXISTING");
        for (int i = 0; i < 23; i++) records.begin("s1", new TurnChangeRecord("extra" + i, i, null, null, "RUNNING", List.of(), List.of()));
        assertThat(records.list("s1", "", "", 0)).hasSize(21);
        assertThat(records.list("s1", "", "", 20)).hasSize(4);
        assertThat(records.list("s1", "%", "", 0)).isEmpty();
    }
    @Test void sessionDeletionCascadesAndMissingGitDoesNotClaimEmptyComplete() {
        when(repos.list("s1")).thenReturn(List.of());
        service.begin("s1", "no-git"); service.finish("s1", "no-git", "end_turn");
        assertThat(records.find("s1", "no-git").orElseThrow().state()).isEqualTo("PARTIAL");
        new JdbcTemplate(dataSource).update("DELETE FROM claude_chat_session WHERE id='s1'");
        assertThat(records.find("s1", "no-git")).isEmpty();
    }
    private void git(String... args) throws Exception {
        List<String> command = new ArrayList<>(List.of("git", "-C", root.toString())); command.addAll(List.of(args));
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        assertThat(process.waitFor()).as(output).isZero();
    }
}
