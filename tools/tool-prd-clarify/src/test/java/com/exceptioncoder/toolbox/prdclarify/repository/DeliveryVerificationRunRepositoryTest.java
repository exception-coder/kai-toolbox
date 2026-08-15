package com.exceptioncoder.toolbox.prdclarify.repository;

import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryVerificationRun;
import com.exceptioncoder.toolbox.prdclarify.domain.DeliveryVerificationStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DeliveryVerificationRunRepositoryTest {

    private DeliveryVerificationRunRepository repository;

    @BeforeEach
    void setUp() {
        JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        jdbc.execute("""
                CREATE TABLE delivery_verification_run (
                    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, command_id TEXT NOT NULL,
                    git_head TEXT NOT NULL, status TEXT NOT NULL, exit_code INTEGER, test_count INTEGER,
                    output_summary TEXT, last_error TEXT, started_at INTEGER NOT NULL,
                    finished_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
                )
                """);
        jdbc.execute("""
                CREATE UNIQUE INDEX idx_delivery_verification_single_running
                ON delivery_verification_run(session_id) WHERE status = 'RUNNING'
                """);
        repository = new DeliveryVerificationRunRepository(jdbc);
    }

    @Test
    void enforcesSingleRunningRunAndFirstTerminalStateWins() {
        repository.insert(run("run-1", 10));

        assertThat(repository.existsRunning("session-1")).isTrue();
        assertThatThrownBy(() -> repository.insert(run("run-2", 11)))
                .isInstanceOf(DataAccessException.class);
        assertThat(repository.complete("run-1", DeliveryVerificationStatus.SUCCEEDED,
                0, 12, "ok", null, 20)).isTrue();
        assertThat(repository.complete("run-1", DeliveryVerificationStatus.FAILED,
                1, null, "failed", null, 21)).isFalse();
        assertThat(repository.findLatest("session-1")).get().satisfies(saved -> {
            assertThat(saved.status()).isEqualTo(DeliveryVerificationStatus.SUCCEEDED);
            assertThat(saved.testCount()).isEqualTo(12);
        });
    }

    private DeliveryVerificationRun run(String id, long createdAt) {
        return new DeliveryVerificationRun(id, "session-1", "maven-test", "abc",
                DeliveryVerificationStatus.RUNNING, null, null, null, null,
                createdAt, null, createdAt, createdAt);
    }
}
