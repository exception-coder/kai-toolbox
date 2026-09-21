package com.exceptioncoder.toolbox.claudechat.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/** 持久化一个逻辑会话链路在不同 Codex Auth 目录下的唯一会话。 */
@Repository
public class AuthSessionLinkRepository {
    private final JdbcTemplate jdbc;

    public AuthSessionLinkRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public String ensureLineage(String sessionId, String authKey, long now) {
        Optional<String> existing = lineageOf(sessionId);
        if (existing.isPresent()) return existing.get();
        jdbc.update("INSERT OR IGNORE INTO claude_chat_auth_session_link "
                        + "(session_id, lineage_id, auth_key, created_at) VALUES (?, ?, ?, ?)",
                sessionId, sessionId, authKey, now);
        return lineageOf(sessionId).orElse(sessionId);
    }

    public Optional<String> lineageOf(String sessionId) {
        return jdbc.query("SELECT lineage_id FROM claude_chat_auth_session_link WHERE session_id = ?",
                (rs, row) -> rs.getString(1), sessionId).stream().findFirst();
    }

    public Optional<String> findSession(String lineageId, String authKey) {
        return jdbc.query("SELECT session_id FROM claude_chat_auth_session_link WHERE lineage_id = ? AND auth_key = ?",
                (rs, row) -> rs.getString(1), lineageId, authKey).stream().findFirst();
    }

    public boolean bind(String sessionId, String lineageId, String authKey, long now) {
        return jdbc.update("INSERT OR IGNORE INTO claude_chat_auth_session_link "
                        + "(session_id, lineage_id, auth_key, created_at) VALUES (?, ?, ?, ?)",
                sessionId, lineageId, authKey, now) == 1;
    }
}
