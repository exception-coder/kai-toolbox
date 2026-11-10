package com.exceptioncoder.toolbox.claudechat.repository;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;

class SessionCredentialStorageTest {

    private JdbcTemplate sessionTable() {
        JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        jdbc.execute("""
                CREATE TABLE claude_chat_session (
                    id TEXT PRIMARY KEY, user_id INTEGER, cwd TEXT NOT NULL, title TEXT, sdk_session_id TEXT,
                    engine TEXT, engines TEXT, engine_sessions TEXT, api_base_url TEXT, auth_token TEXT, codex_home TEXT,
                    selected_model TEXT, codex_reasoning_effort TEXT, codex_speed TEXT,
                    permission_mode TEXT NOT NULL DEFAULT 'default', execution_policy TEXT, consult_evidence_systems TEXT,
                    assistant_app_id TEXT, assistant_page_key TEXT, assistant_page_url TEXT,
                    group_name TEXT, subgroup_name TEXT, favorite INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL, started_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL)
                """);
        jdbc.update("INSERT INTO claude_chat_session (id, cwd, status, started_at, last_seen_at) VALUES ('s1', 'D:/w', 'IDLE', 1, 1)");
        return jdbc;
    }

    @Test
    void providerTokenIsEncryptedAtRestAndDecryptedOnRead() {
        JdbcTemplate jdbc = sessionTable();
        var repository = new ClaudeChatSessionRepository(jdbc);

        repository.updateProvider("s1", "https://gateway.example", "sk-test-not-real");

        String stored = jdbc.queryForObject("SELECT auth_token FROM claude_chat_session WHERE id = 's1'", String.class);
        assertThat(stored).startsWith(SessionCredentialCipher.PREFIX).doesNotContain("sk-test-not-real");
        assertThat(repository.findById("s1")).get().satisfies(s -> assertThat(s.getAuthToken()).isEqualTo("sk-test-not-real"));

        repository.updateProvider("s1", null, null);
        assertThat(repository.findById("s1")).get().satisfies(s -> assertThat(s.getAuthToken()).isNull());
    }

    @Test
    void legacyPlaintextIsReadableAndMigratedOnce() {
        JdbcTemplate jdbc = sessionTable();
        jdbc.update("UPDATE claude_chat_session SET auth_token = 'legacy-plain' WHERE id = 's1'");
        var cipher = SessionCredentialCipher.withDefaultSecret();
        var repository = new ClaudeChatSessionRepository(jdbc, cipher);

        assertThat(repository.findById("s1")).get().satisfies(s -> assertThat(s.getAuthToken()).isEqualTo("legacy-plain"));

        var migration = new SessionCredentialMigration(jdbc, cipher);
        assertThat(migration.encryptPlaintextTokens()).isEqualTo(1);
        assertThat(migration.encryptPlaintextTokens()).isZero();
        assertThat(jdbc.queryForObject("SELECT auth_token FROM claude_chat_session WHERE id = 's1'", String.class))
                .startsWith(SessionCredentialCipher.PREFIX);
        assertThat(repository.findById("s1")).get().satisfies(s -> assertThat(s.getAuthToken()).isEqualTo("legacy-plain"));
    }

    @Test
    void ciphertextFromAnotherSecretIsTreatedAsMissing() {
        var other = new SessionCredentialCipher("another-secret");
        assertThat(SessionCredentialCipher.withDefaultSecret().decrypt(other.encrypt("sk-x"))).isNull();
    }
}
