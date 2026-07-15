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
            .mdPath(rs.getString("md_path"))
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
                "INSERT INTO prd_session (id, title, project, module, raw_input, questions, status, md_path, model, error_msg, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                s.getId(), s.getTitle(), s.getProject(), s.getModule(),
                s.getRawInput(), s.getQuestions(), s.getStatus(),
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

    /** 标记错误状态。 */
    public void updateError(String id, String errorMsg) {
        jdbc.update("UPDATE prd_session SET status = 'ERROR', error_msg = ?, updated_at = ? WHERE id = ?",
                errorMsg, System.currentTimeMillis(), id);
    }

    public void delete(String id) {
        jdbc.update("DELETE FROM prd_session WHERE id = ?", id);
    }
}
