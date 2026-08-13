package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.SessionPendingSql;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class SessionPendingSqlRepositoryTest {

    private JdbcTemplate jdbc;
    private SessionPendingSqlRepository repository;

    @BeforeEach
    void setUp() {
        SingleConnectionDataSource dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("""
                CREATE TABLE claude_chat_pending_sql (
                    session_id TEXT PRIMARY KEY,
                    title TEXT,
                    target_environment TEXT,
                    change_type TEXT NOT NULL,
                    sql_text TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    executed_at INTEGER
                    ,ddl_evidence_status TEXT NOT NULL DEFAULT 'NOT_CHECKED'
                    ,ddl_project TEXT
                    ,ddl_baseline_path TEXT
                    ,ddl_evidence_id TEXT
                    ,ddl_verified_tables TEXT
                    ,ddl_missing_tables TEXT
                    ,ddl_checked_at INTEGER
                )
                """);
        repository = new SessionPendingSqlRepository(jdbc, new ObjectMapper());
    }

    @Test
    void readsPendingRecordWhenExecutedAtIsNull() {
        jdbc.update("""
                        INSERT INTO claude_chat_pending_sql
                            (session_id, title, target_environment, change_type, sql_text, status,
                             created_at, updated_at, executed_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
                        """,
                "session-1", "Pending SQL", "test", "MIXED", "SELECT 1", "PENDING", 100L, 200L);

        SessionPendingSql result = repository.findBySessionId("session-1");

        assertNotNull(result);
        assertEquals(100L, result.createdAt());
        assertEquals(200L, result.updatedAt());
        assertNull(result.executedAt());
    }

    @Test
    void readsExecutedTimestampWhenPresent() {
        jdbc.update("""
                        INSERT INTO claude_chat_pending_sql
                            (session_id, title, target_environment, change_type, sql_text, status,
                             created_at, updated_at, executed_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                "session-2", "Executed SQL", "test", "MIXED", "SELECT 1", "EXECUTED", 100L, 200L, 300L);

        SessionPendingSql result = repository.findBySessionId("session-2");

        assertNotNull(result);
        assertEquals(300L, result.executedAt());
    }
}
