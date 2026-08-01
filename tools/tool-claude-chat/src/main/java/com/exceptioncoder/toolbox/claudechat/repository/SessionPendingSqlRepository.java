package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.SessionPendingSql;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

/** 会话待执行 SQL 台账的 SQLite 持久化。 */
@Repository
public class SessionPendingSqlRepository {

    private static final RowMapper<SessionPendingSql> ROW_MAPPER = (rs, rowNum) -> new SessionPendingSql(
            rs.getString("session_id"),
            rs.getString("title"),
            rs.getString("target_environment"),
            rs.getString("change_type"),
            rs.getString("sql_text"),
            rs.getString("status"),
            rs.getLong("created_at"),
            rs.getLong("updated_at"),
            rs.getObject("executed_at", Long.class));

    private final JdbcTemplate jdbc;

    public SessionPendingSqlRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 查询会话登记，不存在时返回 {@code null}。 */
    public SessionPendingSql findBySessionId(String sessionId) {
        List<SessionPendingSql> rows = jdbc.query(
                "SELECT * FROM claude_chat_pending_sql WHERE session_id = ?", ROW_MAPPER, sessionId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 保存会话唯一登记，冲突时保留首次创建时间并覆盖其余字段。 */
    public void upsert(SessionPendingSql pendingSql) {
        jdbc.update("""
                INSERT INTO claude_chat_pending_sql
                    (session_id, title, target_environment, change_type, sql_text, status,
                     created_at, updated_at, executed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    title = excluded.title,
                    target_environment = excluded.target_environment,
                    change_type = excluded.change_type,
                    sql_text = excluded.sql_text,
                    status = excluded.status,
                    updated_at = excluded.updated_at,
                    executed_at = excluded.executed_at
                """,
                pendingSql.sessionId(), pendingSql.title(), pendingSql.targetEnvironment(),
                pendingSql.changeType(), pendingSql.sqlText(), pendingSql.status(),
                pendingSql.createdAt(), pendingSql.updatedAt(), pendingSql.executedAt());
    }

    /** 更新人工处理状态。 */
    public void updateStatus(String sessionId, String status, long updatedAt, Long executedAt) {
        jdbc.update("""
                UPDATE claude_chat_pending_sql
                   SET status = ?, updated_at = ?, executed_at = ?
                 WHERE session_id = ?
                """, status, updatedAt, executedAt, sessionId);
    }

    /** 解除会话和 SQL 登记的关联。 */
    public void deleteBySessionId(String sessionId) {
        jdbc.update("DELETE FROM claude_chat_pending_sql WHERE session_id = ?", sessionId);
    }
}
