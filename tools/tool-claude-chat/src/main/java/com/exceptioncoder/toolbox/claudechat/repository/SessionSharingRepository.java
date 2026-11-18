package com.exceptioncoder.toolbox.claudechat.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 只保存对象和接收者身份，不复制会话内容或账号凭据。 */
@Repository
public class SessionSharingRepository {
    private static final String ACTIVE_READERS = """
            WITH active_readers AS (
                SELECT legacy.session_id, legacy.user_id, legacy.created_at, NULL AS expires_at, 0 AS collaborate
                FROM claude_chat_session_reader legacy WHERE NOT EXISTS (
                    SELECT 1 FROM claude_chat_session_temporary_reader timed WHERE timed.session_id = legacy.session_id
                    AND timed.user_id = legacy.user_id AND timed.collaborate = 1 AND timed.expires_at > ?)
                UNION ALL
                SELECT timed.session_id, timed.user_id, timed.created_at, timed.expires_at, timed.collaborate
                FROM claude_chat_session_temporary_reader timed WHERE timed.expires_at > ?
                AND (timed.collaborate = 1 OR NOT EXISTS (SELECT 1 FROM claude_chat_session_reader legacy
                    WHERE legacy.session_id = timed.session_id AND legacy.user_id = timed.user_id))
            )
            """;
    private final JdbcTemplate jdbc;

    public SessionSharingRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Long> readers(String sessionId) {
        return readerGrants(sessionId).stream().map(ReaderGrant::userId).toList();
    }

    public List<ReaderGrant> readerGrants(String sessionId) {
        long now = System.currentTimeMillis();
        return jdbc.query(ACTIVE_READERS + "SELECT user_id, expires_at, collaborate FROM active_readers WHERE session_id = ? ORDER BY user_id",
                (row, index) -> {
                    long expiresAt = row.getLong("expires_at");
                    Long expiry = row.wasNull() ? null : expiresAt;
                    return new ReaderGrant(row.getLong("user_id"), expiry, row.getBoolean("collaborate"));
                }, now, now, sessionId);
    }

    public List<String> sharedSessions(long userId) {
        long now = System.currentTimeMillis();
        return jdbc.queryForList(ACTIVE_READERS + """
                SELECT session_id FROM active_readers WHERE user_id = ? ORDER BY created_at DESC, session_id LIMIT 100
                """, String.class, now, now, userId);
    }

    public boolean contains(String sessionId, long userId) {
        long now = System.currentTimeMillis();
        return !jdbc.queryForList(ACTIVE_READERS + "SELECT 1 FROM active_readers WHERE session_id = ? AND user_id = ?",
                Integer.class, now, now, sessionId, userId).isEmpty();
    }

    public boolean canCollaborate(String sessionId, long userId) {
        return !jdbc.queryForList("""
                SELECT 1 FROM claude_chat_session_temporary_reader timed JOIN auth_user account ON account.id = timed.user_id
                WHERE timed.session_id = ? AND timed.user_id = ? AND timed.collaborate = 1 AND timed.expires_at > ?
                    AND account.enabled = 1
                """, Integer.class, sessionId, userId, System.currentTimeMillis()).isEmpty();
    }

    /** 单条条件写入同时保证幂等与每会话最多 50 人，避免并发先查后写越限。 */
    public void grant(String sessionId, long userId, long actor) {
        grant(sessionId, userId, actor, null);
    }

    public void grant(String sessionId, long userId, long actor, Long expiresAt) {
        long now = System.currentTimeMillis();
        String eligible = """
                WHERE NOT EXISTS (SELECT 1 FROM active_readers WHERE session_id = ? AND user_id = ?)
                AND (SELECT COUNT(*) FROM active_readers WHERE session_id = ?) < 50
                """;
        if (expiresAt == null) {
            jdbc.update(ACTIVE_READERS + """
                    INSERT OR IGNORE INTO claude_chat_session_reader (session_id, user_id, granted_by, created_at)
                    SELECT ?, ?, ?, ?
                    """ + eligible, now, now, sessionId, userId, actor, now, sessionId, userId, sessionId);
            return;
        }
        jdbc.update(ACTIVE_READERS + """
                INSERT INTO claude_chat_session_temporary_reader (session_id, user_id, granted_by, created_at, expires_at)
                SELECT ?, ?, ?, ?, ?
                """ + eligible + """
                ON CONFLICT(session_id, user_id) DO UPDATE SET granted_by = excluded.granted_by,
                    created_at = excluded.created_at, expires_at = excluded.expires_at, collaborate = 0
                WHERE claude_chat_session_temporary_reader.expires_at <= excluded.created_at
                """, now, now, sessionId, userId, actor, now, expiresAt, sessionId, userId, sessionId);
    }

    public void grantCollaboration(String sessionId, long userId, long actor, long expiresAt) {
        long now = System.currentTimeMillis();
        jdbc.update(ACTIVE_READERS + """
                INSERT INTO claude_chat_session_temporary_reader (session_id, user_id, granted_by, created_at, expires_at, collaborate)
                SELECT ?, ?, ?, ?, ?, 1 WHERE EXISTS (SELECT 1 FROM active_readers WHERE session_id = ? AND user_id = ?)
                    OR (SELECT COUNT(*) FROM active_readers WHERE session_id = ?) < 50
                ON CONFLICT(session_id, user_id) DO UPDATE SET granted_by = excluded.granted_by,
                    created_at = excluded.created_at, expires_at = excluded.expires_at, collaborate = 1
                WHERE claude_chat_session_temporary_reader.collaborate = 0
                    OR claude_chat_session_temporary_reader.expires_at <= excluded.created_at
                """, now, now, sessionId, userId, actor, now, expiresAt, sessionId, userId, sessionId);
    }

    @Transactional
    public void revoke(String sessionId, long userId) {
        jdbc.update("DELETE FROM claude_chat_session_reader WHERE session_id = ? AND user_id = ?", sessionId, userId);
        jdbc.update("DELETE FROM claude_chat_session_temporary_reader WHERE session_id = ? AND user_id = ?", sessionId, userId);
    }

    public record ReaderGrant(long userId, Long expiresAt, boolean collaborate) {}
}
