package com.exceptioncoder.toolbox.scheduler.repository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.sqlite.SQLiteDataSource;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class SchedulerRepositoryTest {
    @TempDir
    Path tempDir;
    private SchedulerRepository repository;

    @BeforeEach
    void setUp() {
        SQLiteDataSource dataSource = new SQLiteDataSource();
        dataSource.setUrl("jdbc:sqlite:" + tempDir.resolve("scheduler-test.db"));
        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
        jdbcTemplate.execute("""
                CREATE TABLE scheduler_task_override (
                    id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, cron TEXT, zone TEXT,
                    create_time INTEGER NOT NULL, update_time INTEGER NOT NULL)
                """);
        jdbcTemplate.execute("""
                CREATE TABLE scheduler_execution (
                    id TEXT PRIMARY KEY, task_id TEXT NOT NULL, trigger_source TEXT NOT NULL,
                    status TEXT NOT NULL, start_time INTEGER NOT NULL, end_time INTEGER,
                    duration_ms INTEGER, error_summary TEXT,
                    create_time INTEGER NOT NULL, update_time INTEGER NOT NULL)
                """);
        repository = new SchedulerRepository(jdbcTemplate);
    }

    @Test
    void persistsOverrideAndExecutionResult() {
        repository.saveOverride("daily-cleanup", false, "0 0 3 * * *", "Asia/Shanghai");
        repository.startExecution("run-1", "daily-cleanup", "MANUAL", 1_000L);
        repository.finishExecution("run-1", "SUCCESS", 1_125L, 125L, null);

        var override = repository.findOverride("daily-cleanup").orElseThrow();
        var executions = repository.listExecutions("daily-cleanup", 10);

        assertThat(override.enabled()).isFalse();
        assertThat(override.cron()).isEqualTo("0 0 3 * * *");
        assertThat(executions).hasSize(1);
        assertThat(executions.getFirst().status()).isEqualTo("SUCCESS");
        assertThat(executions.getFirst().durationMs()).isEqualTo(125L);
    }

    @Test
    void abortsExecutionLeftRunningByRestart() {
        repository.startExecution("run-stale", "daily-cleanup", "SCHEDULED", 1_000L);

        repository.abortStaleExecutions();

        var execution = repository.listExecutions("daily-cleanup", 1).getFirst();
        assertThat(execution.status()).isEqualTo("ABORTED");
        assertThat(execution.errorSummary()).contains("应用重启");
    }
}
