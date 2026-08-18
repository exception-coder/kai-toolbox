package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.SessionPendingSql;
import com.exceptioncoder.toolbox.claudechat.domain.SessionPendingSqlTarget;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

/** 会话待执行 SQL 台账的 SQLite 持久化。 */
@Repository
public class SessionPendingSqlRepository {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public SessionPendingSqlRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    private static Long nullableLong(ResultSet rs, String column) throws SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    /** 查询会话登记，不存在时返回 {@code null}。 */
    public SessionPendingSql findBySessionId(String sessionId) {
        List<SessionPendingSql> rows = jdbc.query(
                "SELECT * FROM claude_chat_pending_sql WHERE session_id = ?", this::mapRow, sessionId);
        if (rows.isEmpty()) return null;
        SessionPendingSql row = rows.get(0);
        List<SessionPendingSqlTarget> targets = findTargets(sessionId);
        if (targets.isEmpty() && row.sqlText() != null && !row.sqlText().isBlank()) {
            targets = List.of(new SessionPendingSqlTarget(
                    "legacy-" + sessionId, "legacy", null,
                    row.targetEnvironment() == null ? "未指定目标" : row.targetEnvironment(),
                    row.changeType(), row.sqlText(), row.status(), 0,
                    row.createdAt(), row.updatedAt(), row.executedAt()));
        }
        return new SessionPendingSql(
                row.sessionId(), row.title(), row.targetEnvironment(), row.changeType(), row.sqlText(), row.status(),
                row.createdAt(), row.updatedAt(), row.executedAt(), row.ddlEvidenceStatus(), row.ddlProject(),
                row.ddlBaselinePath(), row.ddlEvidenceId(), row.ddlVerifiedTables(), row.ddlMissingTables(),
                row.ddlCheckedAt(), targets);
    }

    /** 保存会话唯一登记，冲突时保留首次创建时间并覆盖其余字段。 */
    @Transactional
    public void upsert(SessionPendingSql pendingSql) {
        jdbc.update("""
                INSERT INTO claude_chat_pending_sql
                    (session_id, title, target_environment, change_type, sql_text, status,
                     created_at, updated_at, executed_at, ddl_evidence_status, ddl_project,
                     ddl_baseline_path, ddl_evidence_id, ddl_verified_tables, ddl_missing_tables, ddl_checked_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    title = excluded.title,
                    target_environment = excluded.target_environment,
                    change_type = excluded.change_type,
                    sql_text = excluded.sql_text,
                    status = excluded.status,
                    updated_at = excluded.updated_at,
                    executed_at = excluded.executed_at,
                    ddl_evidence_status = excluded.ddl_evidence_status,
                    ddl_project = excluded.ddl_project,
                    ddl_baseline_path = excluded.ddl_baseline_path,
                    ddl_evidence_id = excluded.ddl_evidence_id,
                    ddl_verified_tables = excluded.ddl_verified_tables,
                    ddl_missing_tables = excluded.ddl_missing_tables,
                    ddl_checked_at = excluded.ddl_checked_at
                """,
                pendingSql.sessionId(), pendingSql.title(), pendingSql.targetEnvironment(),
                pendingSql.changeType(), pendingSql.sqlText(), pendingSql.status(),
                pendingSql.createdAt(), pendingSql.updatedAt(), pendingSql.executedAt(),
                pendingSql.ddlEvidenceStatus(), pendingSql.ddlProject(), pendingSql.ddlBaselinePath(),
                pendingSql.ddlEvidenceId(), writeList(pendingSql.ddlVerifiedTables()),
                writeList(pendingSql.ddlMissingTables()), pendingSql.ddlCheckedAt());
        jdbc.update("DELETE FROM claude_chat_pending_sql_target WHERE session_id = ?", pendingSql.sessionId());
        for (SessionPendingSqlTarget target : pendingSql.targets()) {
            jdbc.update("""
                    INSERT INTO claude_chat_pending_sql_target
                        (target_id, session_id, target_key, datasource_id, target_environment, change_type,
                         sql_text, status, sort_order, created_at, updated_at, executed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, target.targetId(), pendingSql.sessionId(), target.targetKey(), target.datasourceId(),
                    target.targetEnvironment(), target.changeType(), target.sqlText(), target.status(),
                    target.sortOrder(), target.createdAt(), target.updatedAt(), target.executedAt());
        }
    }

    /** 更新人工处理状态。 */
    public void updateStatus(String sessionId, String status, long updatedAt, Long executedAt) {
        jdbc.update("""
                UPDATE claude_chat_pending_sql
                   SET status = ?, updated_at = ?, executed_at = ?
                 WHERE session_id = ?
                """, status, updatedAt, executedAt, sessionId);
        jdbc.update("""
                UPDATE claude_chat_pending_sql_target
                   SET status = ?, updated_at = ?, executed_at = ?
                 WHERE session_id = ?
                """, status, updatedAt, executedAt, sessionId);
    }

    /** 解除会话和 SQL 登记的关联。 */
    public void deleteBySessionId(String sessionId) {
        jdbc.update("DELETE FROM claude_chat_pending_sql_target WHERE session_id = ?", sessionId);
        jdbc.update("DELETE FROM claude_chat_pending_sql WHERE session_id = ?", sessionId);
    }

    private List<SessionPendingSqlTarget> findTargets(String sessionId) {
        return jdbc.query("""
                SELECT * FROM claude_chat_pending_sql_target
                 WHERE session_id = ? ORDER BY sort_order, target_id
                """, (rs, rowNum) -> new SessionPendingSqlTarget(
                rs.getString("target_id"), rs.getString("target_key"), rs.getString("datasource_id"),
                rs.getString("target_environment"), rs.getString("change_type"), rs.getString("sql_text"),
                rs.getString("status"), rs.getInt("sort_order"), rs.getLong("created_at"),
                rs.getLong("updated_at"), nullableLong(rs, "executed_at")), sessionId);
    }

    private List<String> readList(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<>() { });
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    private SessionPendingSql mapRow(ResultSet rs, int rowNum) throws SQLException {
        return new SessionPendingSql(
                rs.getString("session_id"),
                rs.getString("title"),
                rs.getString("target_environment"),
                rs.getString("change_type"),
                rs.getString("sql_text"),
                rs.getString("status"),
                rs.getLong("created_at"),
                rs.getLong("updated_at"),
                nullableLong(rs, "executed_at"),
                rs.getString("ddl_evidence_status"),
                rs.getString("ddl_project"),
                rs.getString("ddl_baseline_path"),
                rs.getString("ddl_evidence_id"),
                readList(rs.getString("ddl_verified_tables")),
                readList(rs.getString("ddl_missing_tables")),
                nullableLong(rs, "ddl_checked_at"));
    }

    private String writeList(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values == null ? List.of() : values);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("序列化 DDL 核验表清单失败", e);
        }
    }
}
