package com.exceptioncoder.toolbox.claudechat.repository;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;

class ClaudeChatSessionRepositoryRowMappingTest {

    @Test
    void mapsLegacyNullUserIdWithoutFailingSessionRecovery() {
        SingleConnectionDataSource dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("""
                CREATE TABLE claude_chat_session (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER,
                    cwd TEXT NOT NULL,
                    title TEXT,
                    sdk_session_id TEXT,
                    engine TEXT,
                    engines TEXT,
                    engine_sessions TEXT,
                    api_base_url TEXT,
                    auth_token TEXT,
                    codex_home TEXT,
                    selected_model TEXT,
                    codex_reasoning_effort TEXT,
                    codex_speed TEXT,
                    execution_policy TEXT,
                    consult_evidence_systems TEXT,
                    group_name TEXT,
                    subgroup_name TEXT,
                    favorite INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL,
                    started_at INTEGER NOT NULL,
                    last_seen_at INTEGER NOT NULL
                )
                """);
        jdbc.update("""
                INSERT INTO claude_chat_session
                    (id, user_id, cwd, title, status, started_at, last_seen_at)
                VALUES (?, NULL, ?, ?, ?, ?, ?)
                """, "legacy-session", "D:/workspace", "legacy", "IDLE", 1L, 2L);

        var sessions = new ClaudeChatSessionRepository(jdbc).findAll();

        assertThat(sessions).singleElement().satisfies(session -> {
            assertThat(session.getId()).isEqualTo("legacy-session");
            assertThat(session.getUserId()).isNull();
        });
    }
}
