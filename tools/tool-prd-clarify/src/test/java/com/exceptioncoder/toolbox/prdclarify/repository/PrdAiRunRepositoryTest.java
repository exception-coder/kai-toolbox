package com.exceptioncoder.toolbox.prdclarify.repository;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdAiRun;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdAiRunStatus;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptPurpose;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

public class PrdAiRunRepositoryTest {

    private PrdAiRunRepository repository;

    @BeforeEach
    void setUp() {
        JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        createAiRunTable(jdbc);
        repository = new PrdAiRunRepository(jdbc);
    }

    @Test
    void persistsLifecycleAndBusinessLinksWithoutOverwritingTerminalState() {
        repository.insert(run("run-1"));

        assertThat(repository.complete("run-1", PrdAiRunStatus.SUCCEEDED, "output-sha", null, 2L)).isTrue();
        assertThat(repository.complete("run-1", PrdAiRunStatus.FAILED, null, "late", 3L)).isFalse();
        repository.bindCandidate(List.of("run-1"), "candidate-1");
        repository.bindArtifact("run-1", "artifact-1");

        assertThat(repository.findById("run-1")).get().satisfies(saved -> {
            assertThat(saved.status()).isEqualTo(PrdAiRunStatus.SUCCEEDED);
            assertThat(saved.outputSha256()).isEqualTo("output-sha");
            assertThat(saved.candidateId()).isEqualTo("candidate-1");
            assertThat(saved.artifactId()).isEqualTo("artifact-1");
            assertThat(saved.finishedAt()).isEqualTo(2L);
        });
    }

    public static void createAiRunTable(JdbcTemplate jdbc) {
        jdbc.execute("""
                CREATE TABLE prd_ai_run (
                    id TEXT PRIMARY KEY,
                    session_id TEXT,
                    purpose TEXT NOT NULL,
                    prompt_version TEXT NOT NULL,
                    prompt_sha256 TEXT NOT NULL,
                    input_fingerprint TEXT NOT NULL,
                    engine TEXT,
                    model TEXT,
                    candidate_id TEXT,
                    artifact_id TEXT,
                    status TEXT NOT NULL,
                    output_sha256 TEXT,
                    last_error TEXT,
                    started_at INTEGER NOT NULL,
                    finished_at INTEGER,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )
                """);
    }

    private PrdAiRun run(String id) {
        return new PrdAiRun(
                id, "session-1", PrdPromptPurpose.DOC_CHANGE_ANALYZER, "v1", "prompt-sha",
                "input-sha", "codex", "gpt", null, null, PrdAiRunStatus.RUNNING,
                null, null, 1L, null, 1L, 1L);
    }
}
