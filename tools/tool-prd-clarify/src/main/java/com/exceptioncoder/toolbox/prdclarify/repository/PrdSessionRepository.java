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
            .clarifyMode(rs.getString("clarify_mode"))
            .mdPath(rs.getString("md_path"))
            .devDocPath(rs.getString("dev_doc_path"))
            .devSessionId(rs.getString("dev_session_id"))
            .devDocGeneratedAt(rs.getObject("dev_doc_generated_at") == null ? null : rs.getLong("dev_doc_generated_at"))
            .devDocHistory(rs.getString("dev_doc_history"))
            .devDocEstimation(rs.getString("dev_doc_estimation"))
            .createdByUserId(rs.getObject("created_by_user_id") == null ? null : rs.getLong("created_by_user_id"))
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
                "INSERT INTO prd_session (id, title, project, module, raw_input, questions, status, role, req_type, max_questions, clarify_mode, md_path, model, error_msg, created_by_user_id, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                s.getId(), s.getTitle(), s.getProject(), s.getModule(),
                s.getRawInput(), s.getQuestions(), s.getStatus(), s.getRole(),
                s.getReqType(), s.getMaxQuestions(), s.getClarifyMode(),
                s.getMdPath(), s.getModel(), s.getErrorMsg(), s.getCreatedByUserId(),
                s.getCreatedAt(), s.getUpdatedAt());
    }

    public Optional<PrdSession> findById(String id) {
        List<PrdSession> rows = jdbc.query(
                "SELECT * FROM prd_session WHERE id = ?", ROW, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /**
     * 按关联的 Vibe Coding 开发会话 ID 反查 PRD 会话——claude-chat 聊天窗口据此判断"当前会话
     * 是否已绑定 PRD"、渲染标识。一个开发会话正常只应关联一条 PRD；若历史数据有多条误关联到
     * 同一个 dev_session_id，取最近更新的一条兜底。
     */
    public Optional<PrdSession> findByDevSessionId(String devSessionId) {
        List<PrdSession> rows = jdbc.query(
                "SELECT * FROM prd_session WHERE dev_session_id = ? ORDER BY updated_at DESC LIMIT 1",
                ROW, devSessionId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /** 最近 N 条记录，按创建时间倒序，不做用户过滤（ADMIN 角色 / 未登录兜底走这个）。 */
    public List<PrdSession> findRecent(int limit) {
        return jdbc.query(
                "SELECT * FROM prd_session ORDER BY created_at DESC LIMIT ?", ROW, limit);
    }

    /** 最近 N 条记录，只看指定创建者（普通用户的历史列表按此隔离，见 PrdClarifyController#list）。 */
    public List<PrdSession> findRecentByUser(int limit, long userId) {
        return jdbc.query(
                "SELECT * FROM prd_session WHERE created_by_user_id = ? ORDER BY created_at DESC LIMIT ?",
                ROW, userId, limit);
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

    /**
     * 重命名会话标题。
     *
     * <p>纯元数据字段，故意不 touch {@code updated_at}（原因同 {@link #updateDevDocPath}）：
     * 标题跟 PRD/开发文档内容无关，改标题不应该让已生成的开发文档被误判为过期。</p>
     */
    public void updateTitle(String id, String title) {
        jdbc.update("UPDATE prd_session SET title = ? WHERE id = ?", title, id);
    }

    /**
     * 更新 AI 工时评估结果（JSON 整体覆盖）。
     * 纯衍生数据，故意不 touch {@code updated_at}（原因同 {@link #updateDevDocPath}）。
     */
    public void updateDevDocEstimation(String id, String devDocEstimationJson) {
        jdbc.update("UPDATE prd_session SET dev_doc_estimation = ? WHERE id = ?",
                devDocEstimationJson, id);
    }

    /** 标记错误状态。 */
    public void updateError(String id, String errorMsg) {
        jdbc.update("UPDATE prd_session SET status = 'ERROR', error_msg = ?, updated_at = ? WHERE id = ?",
                errorMsg, System.currentTimeMillis(), id);
    }

    public void delete(String id) {
        jdbc.update("DELETE FROM prd_session WHERE id = ?", id);
    }

    /** 无归属（created_by_user_id 为 NULL）的记录数，供启动期迁移做幂等判断。 */
    public long countMissingOwner() {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(1) FROM prd_session WHERE created_by_user_id IS NULL", Long.class);
        return n == null ? 0 : n;
    }

    /**
     * 把所有无归属的存量记录统一回填成指定用户（启动时一次性迁移用，见
     * {@code PrdSessionOwnerMigration}）。故意不 touch updated_at（原因同 updateDevDocPath）。
     *
     * @return 实际回填的行数
     */
    public int backfillOwner(long userId) {
        return jdbc.update(
                "UPDATE prd_session SET created_by_user_id = ? WHERE created_by_user_id IS NULL", userId);
    }
}
