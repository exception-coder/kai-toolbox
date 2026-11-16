package com.exceptioncoder.toolbox.claudechat.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** 会话交接状态和追加文字证据；调用方在会话锁内编排。 */
@Repository
public class EngineHandoffRepository {
    private final JdbcTemplate jdbc;

    public EngineHandoffRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Optional<String> state(String sessionId) {
        return jdbc.query("SELECT state_json FROM claude_chat_engine_handoff WHERE session_id = ?",
                (rs, row) -> rs.getString(1), sessionId).stream().findFirst();
    }

    public void save(String sessionId, String state) {
        jdbc.update("INSERT INTO claude_chat_engine_handoff(session_id,state_json) VALUES (?,?) "
                + "ON CONFLICT(session_id) DO UPDATE SET state_json=excluded.state_json", sessionId, state);
    }

    public void append(String sessionId, String key, String engine, String role, String content) {
        if (content == null || content.isBlank()) { return; }
        jdbc.update("INSERT INTO claude_chat_context_message(session_id,message_key,engine,role,content) "
                + "VALUES (?,?,?,?,?) ON CONFLICT(session_id,message_key) DO UPDATE SET content=excluded.content",
                sessionId, key, engine, role, content);
    }

    public List<Entry> messages(String sessionId, long after) {
        return jdbc.query("SELECT sequence,engine,role,content FROM claude_chat_context_message "
                + "WHERE session_id=? AND sequence>? ORDER BY sequence",
                (rs, row) -> new Entry(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4)),
                sessionId, after);
    }

    public record Entry(long sequence, String engine, String role, String content) {}
}
