package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.SessionAffectedApi;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SessionAffectedApiRepositoryTest {

    private SessionAffectedApiRepository repository;

    @BeforeEach
    void setUp() {
        JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        jdbc.execute("""
                CREATE TABLE claude_chat_session_affected_api (
                    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, http_method TEXT NOT NULL,
                    api_path TEXT NOT NULL, change_type TEXT NOT NULL, source_file TEXT NOT NULL,
                    handler_name TEXT, summary TEXT, verification_status TEXT NOT NULL,
                    verification_method TEXT, verification_command TEXT, verification_summary TEXT,
                    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, verified_at INTEGER,
                    UNIQUE (session_id, http_method, api_path)
                )
                """);
        repository = new SessionAffectedApiRepository(jdbc);
    }

    @Test
    void upsertsBySessionMethodAndPath() {
        repository.upsert(api("id-1", "UNVERIFIED", 1));
        repository.upsert(api("id-2", "PASSED", 2));

        List<SessionAffectedApi> entries = repository.findBySessionId("session-1");
        assertThat(entries).hasSize(1);
        assertThat(entries.getFirst().id()).isEqualTo("id-1");
        assertThat(entries.getFirst().verificationStatus()).isEqualTo("PASSED");
        assertThat(entries.getFirst().updatedAt()).isEqualTo(2);
    }

    private static SessionAffectedApi api(String id, String status, long timestamp) {
        return new SessionAffectedApi(id, "session-1", "GET", "/api/orders", "MODIFIED",
                "src/OrderController.java", "OrderController#list", "orders", status,
                "PASSED".equals(status) ? "AUTOMATED_TEST" : null, null,
                "PASSED".equals(status) ? "passed" : null, 1, timestamp,
                "PASSED".equals(status) ? timestamp : null);
    }
}
