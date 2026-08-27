package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.SessionAffectedApi;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

/** 会话接口变更台账的 SQLite 持久化。 */
@Repository
public class SessionAffectedApiRepository {

    private final JdbcTemplate jdbc;

    public SessionAffectedApiRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<SessionAffectedApi> findBySessionId(String sessionId) {
        return jdbc.query("""
                SELECT id, session_id, http_method, api_path, change_type, source_file,
                       handler_name, summary, verification_status, verification_method,
                       verification_command, verification_summary, created_at, updated_at, verified_at
                  FROM claude_chat_session_affected_api
                 WHERE session_id = ?
                 ORDER BY CASE verification_status
                              WHEN 'FAILED' THEN 0 WHEN 'UNVERIFIED' THEN 1
                              WHEN 'PASSED' THEN 2 ELSE 3 END,
                          updated_at DESC, http_method, api_path
                """, (rs, rowNum) -> new SessionAffectedApi(
                rs.getString("id"), rs.getString("session_id"), rs.getString("http_method"),
                rs.getString("api_path"), rs.getString("change_type"), rs.getString("source_file"),
                rs.getString("handler_name"), rs.getString("summary"),
                rs.getString("verification_status"), rs.getString("verification_method"),
                rs.getString("verification_command"), rs.getString("verification_summary"),
                rs.getLong("created_at"), rs.getLong("updated_at"),
                rs.getObject("verified_at", Long.class)), sessionId);
    }

    public void upsert(SessionAffectedApi api) {
        jdbc.update("""
                INSERT INTO claude_chat_session_affected_api
                    (id, session_id, http_method, api_path, change_type, source_file,
                     handler_name, summary, verification_status, verification_method,
                     verification_command, verification_summary, created_at, updated_at, verified_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id, http_method, api_path) DO UPDATE SET
                    change_type = excluded.change_type,
                    source_file = excluded.source_file,
                    handler_name = excluded.handler_name,
                    summary = excluded.summary,
                    verification_status = excluded.verification_status,
                    verification_method = excluded.verification_method,
                    verification_command = excluded.verification_command,
                    verification_summary = excluded.verification_summary,
                    updated_at = excluded.updated_at,
                    verified_at = excluded.verified_at
                """, api.id(), api.sessionId(), api.httpMethod(), api.apiPath(), api.changeType(),
                api.sourceFile(), api.handlerName(), api.summary(), api.verificationStatus(),
                api.verificationMethod(), api.verificationCommand(), api.verificationSummary(),
                api.createdAt(), api.updatedAt(), api.verifiedAt());
    }

    public void deleteBySessionId(String sessionId) {
        jdbc.update("DELETE FROM claude_chat_session_affected_api WHERE session_id = ?", sessionId);
    }
}
