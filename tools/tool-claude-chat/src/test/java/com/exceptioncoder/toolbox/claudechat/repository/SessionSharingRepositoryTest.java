package com.exceptioncoder.toolbox.claudechat.repository;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.nio.charset.StandardCharsets;
import static org.assertj.core.api.Assertions.*;

class SessionSharingRepositoryTest {
    @Test
    void legacyTemporarySharesStayReadOnlyAfterIdempotentMigration() throws Exception {
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite::memory:")) {
            var jdbc = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
            jdbc.execute("CREATE TABLE claude_chat_session_temporary_reader (session_id TEXT, user_id INTEGER, expires_at INTEGER)");
            jdbc.update("INSERT INTO claude_chat_session_temporary_reader (session_id,user_id,expires_at) VALUES ('one',8,100)");
            var migration = new com.exceptioncoder.toolbox.claudechat.config.ClaudeChatSchemaMigration(jdbc);
            migration.addSessionCollaborationScope();
            migration.addSessionCollaborationScope();
            assertThat(jdbc.queryForObject("SELECT collaborate FROM claude_chat_session_temporary_reader", Integer.class)).isZero();
        }
    }

    @Test
    void recipientDirectoryProjectsOnlyEnabledMatchesWithBoundedLiteralSearch() throws Exception {
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite::memory:")) {
            var jdbc = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
            jdbc.execute("CREATE TABLE auth_user (id INTEGER PRIMARY KEY, username TEXT, real_name TEXT, enabled INTEGER, password_hash TEXT)");
            for (int id = 1; id <= 25; id++) {
                jdbc.update("INSERT INTO auth_user VALUES (?, ?, ?, ?, ?)", id, "user" + id, "严伟" + id, 1, "private-hash");
            }
            jdbc.update("INSERT INTO auth_user VALUES (26, 'disabled', '严伟', 0, 'private-hash')");
            var users = new com.exceptioncoder.toolbox.common.auth.repository.AuthUserRepository(jdbc);
            assertThat(users.searchEnabledRecipients("严伟")).hasSize(20)
                    .noneMatch(user -> user.id() == 26);
            assertThat(users.searchEnabledRecipients("%'")).isEmpty();
            assertThat(users.findRecipients(java.util.List.of(26L))).hasSize(1);
            assertThat(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(
                    users.searchEnabledRecipients("user1"))).doesNotContain("password", "private-hash", "roles");
        }
    }

    @Test
    void schemaIsIdempotentGrantsAreUniqueBoundedAndDeletedWithSession() throws Exception {
        try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite::memory:")) {
            var jdbc = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
            jdbc.execute("PRAGMA foreign_keys = ON");
            jdbc.execute("CREATE TABLE claude_chat_session (id TEXT PRIMARY KEY)");
            String schema;
            try (var input = getClass().getResourceAsStream("/db/claude-chat-sharing-schema.sql")) {
                schema = new String(java.util.Objects.requireNonNull(input).readAllBytes(), StandardCharsets.UTF_8);
            }
            for (int pass = 0; pass < 2; pass++) {
                for (String statement : schema.split(";")) {
                    if (!statement.isBlank()) jdbc.execute(statement);
                }
            }
            jdbc.update("INSERT INTO claude_chat_session (id) VALUES (?)", "one");
            var repo = new SessionSharingRepository(jdbc);
            long expiry = System.currentTimeMillis() + 3_600_000;
            repo.grant("one", 8, 7, 1L);
            assertThat(repo.readerGrants("one")).isEmpty();
            assertThat(repo.contains("one", 8)).isFalse();
            assertThat(repo.sharedSessions(8)).isEmpty();
            repo.grant("one", 8, 7, expiry);
            repo.grant("one", 8, 7);
            assertThat(repo.readerGrants("one")).containsExactly(new SessionSharingRepository.ReaderGrant(8, expiry, false));
            assertThat(jdbc.queryForList("SELECT user_id FROM claude_chat_session_reader WHERE session_id = 'one'"))
                    .isEmpty();
            jdbc.execute("CREATE TABLE auth_user (id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL)");
            jdbc.update("INSERT INTO auth_user VALUES (8, 1)");
            assertThat(repo.canCollaborate("one", 8)).isFalse();
            repo.grantCollaboration("one", 8, 7, expiry);
            assertThat(repo.canCollaborate("one", 8)).isTrue();
            assertThat(repo.readerGrants("one")).containsExactly(new SessionSharingRepository.ReaderGrant(8, expiry, true));
            jdbc.update("UPDATE auth_user SET enabled = 0 WHERE id = 8");
            assertThat(repo.canCollaborate("one", 8)).isFalse();
            jdbc.update("UPDATE auth_user SET enabled = 1 WHERE id = 8");
            assertThat(repo.readers("one")).containsExactly(8L);
            repo.revoke("one", 8);
            assertThat(repo.contains("one", 8)).isFalse();
            assertThat(repo.canCollaborate("one", 8)).isFalse();
            for (long id = 1; id <= 51; id++) repo.grant("one", id, 7);
            assertThat(repo.readers("one")).hasSize(50);
            assertThat(repo.contains("one", 51)).isFalse();
            assertThat(repo.sharedSessions(8)).containsExactly("one");
            jdbc.update("DELETE FROM claude_chat_session WHERE id = ?", "one");
            assertThat(repo.sharedSessions(8)).isEmpty();
        }
    }
}
