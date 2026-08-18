package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.SessionPendingSql;
import com.exceptioncoder.toolbox.claudechat.domain.SessionPendingSqlTarget;
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
        jdbc.execute("""
                CREATE TABLE claude_chat_pending_sql_target (
                    target_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    target_key TEXT NOT NULL,
                    datasource_id TEXT,
                    target_environment TEXT NOT NULL,
                    change_type TEXT NOT NULL,
                    sql_text TEXT NOT NULL,
                    status TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    executed_at INTEGER,
                    UNIQUE (session_id, target_key)
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
        assertEquals(1, result.targets().size());
        assertEquals("test", result.targets().get(0).targetEnvironment());
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

    @Test
    void roundTripsTargetDetailsAndGeneratedSummary() {
        SessionPendingSql pendingSql = new SessionPendingSql(
                "session-3", "跨库修复", "2 个目标库", "MIXED", "summary", "PENDING",
                100L, 200L, null, "NOT_CHECKED", null, null, null,
                java.util.List.of(), java.util.List.of(), null,
                java.util.List.of(
                        new SessionPendingSqlTarget("target-a", "datasource:a", "a", "ERP 测试库",
                                "DDL", "ALTER TABLE sample ADD flag INT;", "PENDING", 0, 100L, 200L, null),
                        new SessionPendingSqlTarget("target-b", "datasource:b", "b", "SRM 测试库",
                                "DML", "UPDATE sample SET flag = 1;", "PENDING", 1, 100L, 200L, null)));

        repository.upsert(pendingSql);
        SessionPendingSql result = repository.findBySessionId("session-3");

        assertNotNull(result);
        assertEquals(2, result.targets().size());
        assertEquals("datasource:a", result.targets().get(0).targetKey());
        assertEquals("SRM 测试库", result.targets().get(1).targetEnvironment());
    }
}
