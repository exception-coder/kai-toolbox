package com.exceptioncoder.toolbox.prdclarify.repository;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * prd_session 表的数据访问层。使用 JdbcTemplate + 静态 RowMapper，与其他工具模块保持一致。
 */
@Repository
public class PrdSessionRepository {

    private static final RowMapper<PrdSession> ROW = (rs, i) -> PrdSession.builder()
            .id(rs.getString("id"))
            .title(rs.getString("title"))
            .project(rs.getString("project"))
            .module(rs.getString("module"))
            .rawInput(rs.getString("raw_input"))
            .questions(rs.getString("questions"))
            .status(rs.getString("status"))
            .role(rs.getString("role"))
            .reqType(rs.getString("req_type"))
            .maxQuestions(rs.getInt("max_questions"))
            .mdPath(rs.getString("md_path"))
            .devDocPath(rs.getString("dev_doc_path"))
            .devSessionId(rs.getString("dev_session_id"))
            .devDocGeneratedAt(rs.getObject("dev_doc_generated_at") == null ? null : rs.getLong("dev_doc_generated_at"))
            .devDocHistory(rs.getString("dev_doc_history"))
            .model(rs.getString("model"))
            .errorMsg(rs.getString("error_msg"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    private final JdbcTemplate jdbc;

    public PrdSessionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(PrdSession s) {
        jdbc.update(
                "INSERT INTO prd_session (id, title, project, module, raw_input, questions, status, role, req_type, max_questions, md_path, model, error_msg, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                s.getId(), s.getTitle(), s.getProject(), s.getModule(),
                s.getRawInput(), s.getQuestions(), s.getStatus(), s.getRole(),
                s.getReqType(), s.getMaxQuestions(),
                s.getMdPath(), s.getModel(), s.getErrorMsg(),
                s.getCreatedAt(), s.getUpdatedAt());
    }

    public Optional<PrdSession> findById(String id) {
        List<PrdSession> rows = jdbc.query(
                "SELECT * FROM prd_session WHERE id = ?", ROW, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /** 最近 N 条记录，按创建时间倒序。 */
    public List<PrdSession> findRecent(int limit) {
        return jdbc.query(
                "SELECT * FROM prd_session ORDER BY created_at DESC LIMIT ?", ROW, limit);
    }

    /** 更新澄清问题（JSON 字符串）。 */
    public void updateQuestions(String id, String questionsJson) {
        jdbc.update("UPDATE prd_session SET questions = ?, updated_at = ? WHERE id = ?",
                questionsJson, System.currentTimeMillis(), id);
    }

    /** 更新状态。 */
    public void updateStatus(String id, String status) {
        jdbc.update("UPDATE prd_session SET status = ?, updated_at = ? WHERE id = ?",
                status, System.currentTimeMillis(), id);
    }

    /** 更新 md_path 和状态（生成完成时调用）。 */
    public void updateDone(String id, String mdPath) {
        jdbc.update("UPDATE prd_session SET md_path = ?, status = 'DONE', updated_at = ? WHERE id = ?",
                mdPath, System.currentTimeMillis(), id);
    }

    /**
     * 更新开发文档路径（开发文档生成完成时调用）。
     *
     * <p>故意不touch {@code updated_at}：该字段语义是「PRD 内容最后变更时间」，用于跟
     * {@code dev_doc_generated_at} 比较判断开发文档是否过期。开发文档路径是开发文档自身的
     * 记账信息，不代表 PRD 内容发生了变化，混进 updated_at 会导致后续任意一次纯记账更新
     * （如 {@link #updateDevSessionId}）把 updated_at 推到 dev_doc_generated_at 之后，
     * 造成刚生成完的开发文档被误判为过期。</p>
     */
    public void updateDevDocPath(String id, String devDocPath) {
        jdbc.update("UPDATE prd_session SET dev_doc_path = ? WHERE id = ?",
                devDocPath, id);
    }

    /**
     * 关联 Vibe Coding 开发会话 ID（「开始开发」跳转到 claude-chat 后回写）。
     *
     * <p>纯记账字段，故意不 touch {@code updated_at}（原因同 {@link #updateDevDocPath}）：
     * 此前会在用户点「开始开发」时把 updated_at 推到当前时间，即便 PRD/开发文档内容毫无变化，
     * 也会让开发文档被误判为「已过期」（bug：本已是最新生成的开发文档，仅因关联了开发会话
     * 就被标记过期）。</p>
     */
    public void updateDevSessionId(String id, String devSessionId) {
        jdbc.update("UPDATE prd_session SET dev_session_id = ? WHERE id = ?",
                devSessionId, id);
    }

    /** 更新开发文档生成时间戳（生成完成时调用，用于判断开发文档是否过期）。 */
    public void updateDevDocGeneratedAt(String id, long generatedAt) {
        jdbc.update("UPDATE prd_session SET dev_doc_generated_at = ? WHERE id = ?",
                generatedAt, id);
    }

    /**
     * 更新开发文档生成历史（JSON 数组整体覆盖，追加逻辑在 Service 层完成）。
     * 纯记账字段，故意不 touch {@code updated_at}（原因同 {@link #updateDevDocPath}）。
     */
    public void updateDevDocHistory(String id, String devDocHistoryJson) {
        jdbc.update("UPDATE prd_session SET dev_doc_history = ? WHERE id = ?",
                devDocHistoryJson, id);
    }

    /** 标记错误状态。 */
    public void updateError(String id, String errorMsg) {
        jdbc.update("UPDATE prd_session SET status = 'ERROR', error_msg = ?, updated_at = ? WHERE id = ?",
                errorMsg, System.currentTimeMillis(), id);
    }

    public void delete(String id) {
        jdbc.update("DELETE FROM prd_session WHERE id = ?", id);
    }
}
