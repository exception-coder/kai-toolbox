package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * consult_session 表的数据访问层。JdbcTemplate + 静态 RowMapper，与其他工具模块保持一致。
 */
@Repository
public class ConsultSessionRepository {

    private static final RowMapper<ConsultSession> ROW = (rs, i) -> ConsultSession.builder()
            .sessionId(rs.getString("session_id"))
            .userId(rs.getString("user_id"))
            .systemName(rs.getString("system_name"))
            .systemSourcePath(rs.getString("system_source_path"))
            .moduleNames(rs.getString("module_names"))
            .promptSnapshot(rs.getString("prompt_snapshot"))
            .devSessionId(rs.getString("dev_session_id"))
            .rawReferenceJson(rs.getString("raw_reference_json"))
            .parseStatus(rs.getString("parse_status"))
            .archiveStatus(rs.getString("archive_status"))
            .role(rs.getString("role"))
            .errorMsg(rs.getString("error_msg"))
            .createdAt(rs.getLong("created_at"))
            .endedAt(rs.getObject("ended_at") == null ? null : rs.getLong("ended_at"))
            .build();

    private final JdbcTemplate jdbc;

    public ConsultSessionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(ConsultSession s) {
        jdbc.update(
                "INSERT INTO consult_session (session_id, user_id, system_name, system_source_path, module_names, " +
                "prompt_snapshot, dev_session_id, raw_reference_json, parse_status, archive_status, role, error_msg, created_at, ended_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                s.getSessionId(), s.getUserId(), s.getSystemName(), s.getSystemSourcePath(), s.getModuleNames(),
                s.getPromptSnapshot(), s.getDevSessionId(), s.getRawReferenceJson(), s.getParseStatus(),
                s.getArchiveStatus(), s.getRole(), s.getErrorMsg(), s.getCreatedAt(), s.getEndedAt());
    }

    public Optional<ConsultSession> findById(String sessionId) {
        List<ConsultSession> rows = jdbc.query(
                "SELECT * FROM consult_session WHERE session_id = ?", ROW, sessionId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /** 最近 N 条会话，按创建时间倒序。 */
    public List<ConsultSession> findRecent(int limit) {
        return jdbc.query(
                "SELECT * FROM consult_session ORDER BY created_at DESC LIMIT ?", ROW, limit);
    }

    /** 关联 claude-chat 会话 id（拉起悬浮会话后回写）。 */
    public void updateDevSessionId(String sessionId, String devSessionId) {
        jdbc.update("UPDATE consult_session SET dev_session_id = ? WHERE session_id = ?",
                devSessionId, sessionId);
    }

    /** 归档成功：写入引用清单原始 JSON、解析状态、结束时间，状态置 SUCCESS。 */
    public void markArchived(String sessionId, String rawReferenceJson, String parseStatus, long endedAt) {
        jdbc.update("UPDATE consult_session SET raw_reference_json = ?, parse_status = ?, " +
                        "archive_status = 'SUCCESS', ended_at = ? WHERE session_id = ?",
                rawReferenceJson, parseStatus, endedAt, sessionId);
    }

    /** 进行中增量同步：只更新原始对话 JSON，保持 archive_status/ended_at 不变。 */
    public void updateSyncedRaw(String sessionId, String rawReferenceJson) {
        jdbc.update("UPDATE consult_session SET raw_reference_json = ? WHERE session_id = ?",
                rawReferenceJson, sessionId);
    }

    /** 归档失败：记录错误信息，状态置 FAILED（待补偿）。 */
    public void markFailed(String sessionId, String errorMsg, long endedAt) {
        jdbc.update("UPDATE consult_session SET archive_status = 'FAILED', error_msg = ?, ended_at = ? WHERE session_id = ?",
                errorMsg, endedAt, sessionId);
    }

    public void delete(String sessionId) {
        jdbc.update("DELETE FROM consult_session WHERE session_id = ?", sessionId);
    }
}
