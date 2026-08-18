package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * consult_session 表的数据访问层。JdbcTemplate + 静态 RowMapper，与其他工具模块保持一致。
 */
@Repository
public class ConsultSessionRepository {

    private static final String SUMMARY_COLUMNS = "session_id, user_id, question_title, system_name, "
            + "system_source_path, module_names, dev_session_id, parse_status, archive_status, role, engine, model, "
            + "codex_reasoning_effort, codex_speed, codex_home, orchestration_version, evidence_systems, "
            + "evidence_route_snapshot, error_msg, created_at, ended_at";

    private static final RowMapper<ConsultSession> ROW = (rs, i) -> ConsultSession.builder()
            .sessionId(rs.getString("session_id"))
            .userId(rs.getString("user_id"))
            .questionTitle(rs.getString("question_title"))
            .systemName(rs.getString("system_name"))
            .systemSourcePath(rs.getString("system_source_path"))
            .moduleNames(rs.getString("module_names"))
            .promptSnapshot(rs.getString("prompt_snapshot"))
            .devSessionId(rs.getString("dev_session_id"))
            .rawReferenceJson(rs.getString("raw_reference_json"))
            .parseStatus(rs.getString("parse_status"))
            .archiveStatus(rs.getString("archive_status"))
            .role(rs.getString("role"))
            .engine(rs.getString("engine"))
            .model(rs.getString("model"))
            .codexReasoningEffort(rs.getString("codex_reasoning_effort"))
            .codexSpeed(rs.getString("codex_speed"))
            .codexHome(rs.getString("codex_home"))
            .orchestrationVersion(rs.getString("orchestration_version"))
            .evidenceSystems(rs.getString("evidence_systems"))
            .evidenceRouteSnapshot(rs.getString("evidence_route_snapshot"))
            .errorMsg(rs.getString("error_msg"))
            .createdAt(rs.getLong("created_at"))
            .endedAt(rs.getObject("ended_at") == null ? null : rs.getLong("ended_at"))
            .build();

    private static final RowMapper<ConsultSession> SUMMARY_ROW = (rs, i) -> ConsultSession.builder()
            .sessionId(rs.getString("session_id"))
            .userId(rs.getString("user_id"))
            .questionTitle(rs.getString("question_title"))
            .systemName(rs.getString("system_name"))
            .systemSourcePath(rs.getString("system_source_path"))
            .moduleNames(rs.getString("module_names"))
            .devSessionId(rs.getString("dev_session_id"))
            .parseStatus(rs.getString("parse_status"))
            .archiveStatus(rs.getString("archive_status"))
            .role(rs.getString("role"))
            .engine(rs.getString("engine"))
            .model(rs.getString("model"))
            .codexReasoningEffort(rs.getString("codex_reasoning_effort"))
            .codexSpeed(rs.getString("codex_speed"))
            .codexHome(rs.getString("codex_home"))
            .orchestrationVersion(rs.getString("orchestration_version"))
            .evidenceSystems(rs.getString("evidence_systems"))
            .evidenceRouteSnapshot(rs.getString("evidence_route_snapshot"))
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
                "INSERT INTO consult_session (session_id, user_id, question_title, system_name, system_source_path, module_names, " +
                "prompt_snapshot, dev_session_id, raw_reference_json, parse_status, archive_status, role, engine, model, " +
                "codex_reasoning_effort, codex_speed, codex_home, orchestration_version, evidence_systems, " +
                "evidence_route_snapshot, error_msg, created_at, ended_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                s.getSessionId(), s.getUserId(), s.getQuestionTitle(), s.getSystemName(), s.getSystemSourcePath(), s.getModuleNames(),
                s.getPromptSnapshot(), s.getDevSessionId(), s.getRawReferenceJson(), s.getParseStatus(),
                s.getArchiveStatus(), s.getRole(), s.getEngine(), s.getModel(), s.getCodexReasoningEffort(),
                s.getCodexSpeed(), s.getCodexHome(), s.getOrchestrationVersion(), s.getEvidenceSystems(),
                s.getEvidenceRouteSnapshot(), s.getErrorMsg(),
                s.getCreatedAt(), s.getEndedAt());
    }

    public Optional<ConsultSession> findById(String sessionId) {
        List<ConsultSession> rows = jdbc.query(
                "SELECT * FROM consult_session WHERE session_id = ?", ROW, sessionId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /** 按复用的开发会话 ID 反查业务咨询，用于在通用 Agent 边界补充低敏 Trace 属性。 */
    public Optional<ConsultSession> findByDevSessionId(String devSessionId) {
        if (devSessionId == null || devSessionId.isBlank()) {
            return Optional.empty();
        }
        List<ConsultSession> rows = jdbc.query(
                "SELECT * FROM consult_session WHERE dev_session_id = ? ORDER BY created_at DESC LIMIT 1",
                ROW, devSessionId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /** 检查底层会话是否已被另一条咨询占用。 */
    public boolean existsOtherByDevSessionId(String sessionId, String devSessionId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM consult_session WHERE dev_session_id = ? AND session_id <> ?",
                Integer.class, devSessionId, sessionId);
        return count != null && count > 0;
    }

    /** 最近 N 条会话，按创建时间倒序。 */
    public List<ConsultSession> findRecent(int limit) {
        return jdbc.query(
                "SELECT " + SUMMARY_COLUMNS + " FROM consult_session ORDER BY created_at DESC LIMIT ?",
                SUMMARY_ROW, limit);
    }

    /** 某用户最近 N 条会话，按创建时间倒序。ADMIN 是否走此查询由 service 层决定。 */
    public List<ConsultSession> findRecentByUserId(String userId, int limit) {
        return jdbc.query(
                "SELECT " + SUMMARY_COLUMNS
                        + " FROM consult_session WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
                SUMMARY_ROW, userId, limit);
    }

    /** 按咨询归属 ID 批量读取登录用户名；auth_user 与咨询表共用本地 SQLite。 */
    public Map<String, String> findCreatorNamesByUserIds(List<String> userIds) {
        List<String> ids = userIds == null ? List.of() : userIds.stream()
                .filter(id -> id != null && !id.isBlank())
                .distinct()
                .toList();
        if (ids.isEmpty()) return Map.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        return jdbc.query(
                        "SELECT CAST(id AS TEXT) AS user_id, "
                                + "COALESCE(NULLIF(TRIM(real_name), ''), username) AS creator_name FROM auth_user "
                                + "WHERE CAST(id AS TEXT) IN (" + placeholders + ")",
                        (rs, i) -> Map.entry(rs.getString("user_id"), rs.getString("creator_name")),
                        ids.toArray())
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    /** 仅在尚未关联时绑定 claude-chat 会话，避免异步回调覆盖旧归属。 */
    public int bindDevSessionIdIfAbsent(String sessionId, String devSessionId) {
        return jdbc.update("UPDATE consult_session SET dev_session_id = ? "
                        + "WHERE session_id = ? AND (dev_session_id IS NULL OR TRIM(dev_session_id) = '')",
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

    public void updateQuestionTitleIfEmpty(String sessionId, String questionTitle) {
        jdbc.update("UPDATE consult_session SET question_title = ? WHERE session_id = ? " +
                        "AND (question_title IS NULL OR TRIM(question_title) = '')",
                questionTitle, sessionId);
    }

    /** 更新指定会话的问题标题。 */
    public void updateQuestionTitle(String sessionId, String questionTitle) {
        jdbc.update("UPDATE consult_session SET question_title = ? WHERE session_id = ?", questionTitle, sessionId);
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
