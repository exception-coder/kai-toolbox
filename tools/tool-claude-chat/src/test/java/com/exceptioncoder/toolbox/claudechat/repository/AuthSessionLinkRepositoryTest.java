package com.exceptioncoder.toolbox.claudechat.repository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;

class AuthSessionLinkRepositoryTest {
    private AuthSessionLinkRepository repository;

    @BeforeEach
    void setUp() {
        JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        jdbc.execute("""
                CREATE TABLE claude_chat_auth_session_link (
                    session_id TEXT PRIMARY KEY,
                    lineage_id TEXT NOT NULL,
                    auth_key TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    UNIQUE (lineage_id, auth_key)
                )
                """);
        repository = new AuthSessionLinkRepository(jdbc);
    }

    @Test
    void reusesOneSessionPerLineageAndAuth() {
        String lineage = repository.ensureLineage("session-a", "auth-a", 1L);
        assertThat(repository.bind("session-b", lineage, "auth-b", 2L)).isTrue();

        assertThat(repository.findSession(lineage, "auth-b")).contains("session-b");
        assertThat(repository.bind("duplicate-b", lineage, "auth-b", 3L)).isFalse();
        assertThat(repository.findSession(lineage, "auth-b")).contains("session-b");
        assertThat(repository.ensureLineage("session-b", "auth-b", 4L)).isEqualTo(lineage);
    }
}
