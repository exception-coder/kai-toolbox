package com.exceptioncoder.toolbox.claudechat.repository;

import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 副本的持久请求身份，不依赖 WebSocket 或原生引擎的状态。 */
@Repository
public class SessionCopyRepository {
    private final JdbcTemplate jdbc;

    public SessionCopyRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Receipt(String sourceSessionId, String targetSessionId) {}

    public Optional<Receipt> find(String ownerKey, String requestId) {
        return jdbc.query("""
                SELECT source_session_id, target_session_id FROM claude_chat_session_copy
                WHERE owner_key = ? AND request_id = ?
                """, (rs, row) -> new Receipt(rs.getString(1), rs.getString(2)), ownerKey, requestId)
                .stream().findFirst();
    }

    public void insert(String ownerKey, String requestId, String sourceId, String targetId, long now) {
        jdbc.update("""
                INSERT INTO claude_chat_session_copy
                    (owner_key, request_id, source_session_id, target_session_id, created_at)
                VALUES (?, ?, ?, ?, ?)
                """, ownerKey, requestId, sourceId, targetId, now);
    }
}
