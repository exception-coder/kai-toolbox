package com.exceptioncoder.toolbox.claudechat.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

/** 只保存对象和接收者身份，不复制会话内容或账号凭据。 */
@Repository
public class SessionSharingRepository {
    private final JdbcTemplate jdbc;

    public SessionSharingRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Long> readers(String sessionId) {
        return jdbc.queryForList("SELECT user_id FROM claude_chat_session_reader WHERE session_id = ? ORDER BY user_id",
                Long.class, sessionId);
    }

    public List<String> sharedSessions(long userId) {
        return jdbc.queryForList("SELECT session_id FROM claude_chat_session_reader WHERE user_id = ? ORDER BY created_at DESC, session_id LIMIT 100",
                String.class, userId);
    }

    public boolean contains(String sessionId, long userId) {
        return !jdbc.queryForList("SELECT 1 FROM claude_chat_session_reader WHERE session_id = ? AND user_id = ?",
                Integer.class, sessionId, userId).isEmpty();
    }

    /** 单条条件写入同时保证幂等与每会话最多 50 人，避免并发先查后写越限。 */
    public void grant(String sessionId, long userId, long actor) {
        jdbc.update("""
                INSERT OR IGNORE INTO claude_chat_session_reader (session_id, user_id, granted_by, created_at)
                SELECT ?, ?, ?, ? WHERE
                    (SELECT COUNT(*) FROM claude_chat_session_reader WHERE session_id = ?) < 50
                """, sessionId, userId, actor, System.currentTimeMillis(), sessionId);
    }

    public void revoke(String sessionId, long userId) {
        jdbc.update("DELETE FROM claude_chat_session_reader WHERE session_id = ? AND user_id = ?", sessionId, userId);
    }
}
