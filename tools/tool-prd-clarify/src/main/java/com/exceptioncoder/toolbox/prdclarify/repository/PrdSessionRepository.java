package com.exceptioncoder.toolbox.prdclarify.repository;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdBusinessFields;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

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
            .requirementDetail(rs.getString("requirement_detail"))
            .businessBackground(rs.getString("business_background"))
            .businessRequirementType(rs.getString("business_requirement_type"))
            .requirementSoftware(rs.getString("requirement_software"))
            .initiatingDepartment(rs.getString("initiating_department"))
            .requester(rs.getString("requester"))
            .requestedAt(rs.getString("requested_at"))
            .attachments(rs.getString("source_attachments"))
            .followUpRecords(rs.getString("follow_up_records"))
            .questions(rs.getString("questions"))
            .prdQuestionsGeneratedAt(rs.getObject("prd_questions_generated_at") == null ? null : rs.getLong("prd_questions_generated_at"))
            .prdGeneratedAt(rs.getObject("prd_generated_at") == null ? null : rs.getLong("prd_generated_at"))
            .status(rs.getString("status"))
            .role(rs.getString("role"))
            .reqType(rs.getString("req_type"))
            .maxQuestions(rs.getInt("max_questions"))
            .clarifyMode(rs.getString("clarify_mode"))
            .mdPath(rs.getString("md_path"))
            .devDocPath(rs.getString("dev_doc_path"))
            .devSessionId(rs.getString("dev_session_id"))
            .devDocGeneratedAt(rs.getObject("dev_doc_generated_at") == null ? null : rs.getLong("dev_doc_generated_at"))
            .devDocQuestionsGeneratedAt(rs.getObject("dev_doc_questions_generated_at") == null ? null : rs.getLong("dev_doc_questions_generated_at"))
            .devDocHistory(rs.getString("dev_doc_history"))
            .devDocQaDraft(rs.getString("dev_doc_qa_draft"))
            .devDocWorkStatus(rs.getString("dev_doc_work_status"))
            .devDocWorkError(rs.getString("dev_doc_work_error"))
            .devDocEstimation(rs.getString("dev_doc_estimation"))
            .progressPath(rs.getString("progress_path"))
            .progressGeneratedAt(rs.getObject("progress_generated_at") == null ? null : rs.getLong("progress_generated_at"))
            .progressHistory(rs.getString("progress_history"))
            .parentId(rs.getString("parent_id"))
            .createdByUserId(rs.getObject("created_by_user_id") == null ? null : rs.getLong("created_by_user_id"))
            .model(rs.getString("model"))
            .engine(rs.getString("engine"))
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
                "INSERT INTO prd_session (id, title, project, module, raw_input, requirement_detail, business_background, " +
                "business_requirement_type, requirement_software, initiating_department, requester, requested_at, " +
                "source_attachments, follow_up_records, questions, status, role, req_type, max_questions, clarify_mode, " +
                "md_path, model, engine, error_msg, created_by_user_id, parent_id, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                s.getId(), s.getTitle(), s.getProject(), s.getModule(),
                s.getRawInput(), s.getRequirementDetail(), s.getBusinessBackground(),
                s.getBusinessRequirementType(), s.getRequirementSoftware(), s.getInitiatingDepartment(),
                s.getRequester(), s.getRequestedAt(), s.getAttachments(), s.getFollowUpRecords(),
                s.getQuestions(), s.getStatus(), s.getRole(),
                s.getReqType(), s.getMaxQuestions(), s.getClarifyMode(),
                s.getMdPath(), s.getModel(), s.getEngine(), s.getErrorMsg(), s.getCreatedByUserId(),
                s.getParentId(), s.getCreatedAt(), s.getUpdatedAt());
    }

    public Optional<PrdSession> findById(String id) {
        List<PrdSession> rows = jdbc.query(
                "SELECT * FROM prd_session WHERE id = ?", ROW, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public int nextRevisionNumber(String parentId) {
        Integer count = jdbc.queryForObject(
                """
                SELECT COUNT(*) FROM prd_session
                WHERE parent_id = ?
                  AND (raw_input LIKE '【后台自动修订%' OR raw_input LIKE '【修订版 PRD%')
                """, Integer.class, parentId);
        return (count == null ? 0 : count) + 2;
    }

    public Optional<PrdSession> findLatestRevision(String parentId) {
        List<PrdSession> rows = jdbc.query("""
                SELECT * FROM prd_session
                WHERE parent_id = ? AND raw_input LIKE '【后台自动修订%'
                ORDER BY created_at DESC LIMIT 1
                """, ROW, parentId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.getFirst());
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

    /**
     * 批量按 Vibe Coding 开发会话 ID 反查关联 PRD（{@link #findByDevSessionId} 的批量版本）——
     * 会话列表页要给每一行标出"是否绑定 PRD"，逐行查询会是 N+1，这里一次 IN 查询搞定。
     * 按 updated_at 升序返回，调用方（Controller）塞进 Map 时后写覆盖先写，同一个
     * devSessionId 若历史上误关联了多条，跟 {@link #findByDevSessionId} 一样取最近更新的一条。
     */
    public List<PrdSession> findByDevSessionIds(Collection<String> devSessionIds) {
        if (devSessionIds == null || devSessionIds.isEmpty()) return List.of();
        String placeholders = devSessionIds.stream().map(x -> "?").collect(Collectors.joining(","));
        return jdbc.query(
                "SELECT * FROM prd_session WHERE dev_session_id IN (" + placeholders + ") ORDER BY updated_at ASC",
                ROW, devSessionIds.toArray());
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

    /** 保存本次批量 PRD 澄清问题，并记录问题真正返回的时间。 */
    public void updateGeneratedQuestions(String id, String questionsJson) {
        long now = System.currentTimeMillis();
        jdbc.update("UPDATE prd_session SET questions = ?, prd_questions_generated_at = ?, updated_at = ? WHERE id = ?",
                questionsJson, now, now, id);
    }

    public void clearPrdQuestionsGeneratedAt(String id) {
        jdbc.update("UPDATE prd_session SET prd_questions_generated_at = NULL WHERE id = ?", id);
    }

    /** 更新状态。 */
    public void updateStatus(String id, String status) {
        jdbc.update("UPDATE prd_session SET status = ?, error_msg = NULL, updated_at = ? WHERE id = ?",
                status, System.currentTimeMillis(), id);
    }

    /** 更新 md_path 和状态（生成完成时调用）。 */
    public void updateDone(String id, String mdPath) {
        long now = System.currentTimeMillis();
        jdbc.update("UPDATE prd_session SET md_path = ?, status = 'DONE', prd_generated_at = ?, updated_at = ? WHERE id = ?",
                mdPath, now, now, id);
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

    /** 保存/清空尚未成功生成 TDD 的技术澄清问答，不影响 PRD 新旧判断。 */
    public void updateDevDocQaDraft(String id, String qaDraftJson) {
        jdbc.update("UPDATE prd_session SET dev_doc_qa_draft = ? WHERE id = ?", qaDraftJson, id);
    }

    public void updateDevDocWorkStatus(String id, String status, String error) {
        jdbc.update("UPDATE prd_session SET dev_doc_work_status = ?, dev_doc_work_error = ? WHERE id = ?",
                status, error, id);
    }

    public void updateDevDocQuestionsGeneratedAt(String id, Long generatedAt) {
        jdbc.update("UPDATE prd_session SET dev_doc_questions_generated_at = ? WHERE id = ?", generatedAt, id);
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
     * 修改根 PRD 的项目分组，并递归同步全部拆分/修订子孙节点。
     * project 是列表分组依据，整棵树必须保持一致，避免父节点移动后子节点仍显示旧项目。
     */
    public int updateProjectTree(String id, String project) {
        return jdbc.update("""
                WITH RECURSIVE descendants(id) AS (
                    SELECT id FROM prd_session WHERE id = ?
                    UNION
                    SELECT child.id
                    FROM prd_session child
                    JOIN descendants parent ON child.parent_id = parent.id
                )
                UPDATE prd_session SET project = ? WHERE id IN (SELECT id FROM descendants)
                """, id, project);
    }

    /**
     * 给该功能上线前创建的修订版补 parent_id。修订 raw_input 的首行含原版标题，取修订创建前
     * 最近一条同标题记录作为父节点；只处理 parent_id 为空的记录，重复启动是幂等空操作。
     */
    public int backfillRevisionParents() {
        return jdbc.update("""
                UPDATE prd_session
                SET parent_id = (
                    SELECT parent.id
                    FROM prd_session parent
                    WHERE parent.id <> prd_session.id
                      AND parent.created_at < prd_session.created_at
                      AND prd_session.raw_input LIKE '【修订版 PRD — 基于原版：' || parent.title || '】%'
                    ORDER BY parent.created_at DESC
                    LIMIT 1
                )
                WHERE parent_id IS NULL
                  AND raw_input LIKE '【修订版 PRD — 基于原版：%'
                  AND EXISTS (
                    SELECT 1
                    FROM prd_session parent
                    WHERE parent.id <> prd_session.id
                      AND parent.created_at < prd_session.created_at
                      AND prd_session.raw_input LIKE '【修订版 PRD — 基于原版：' || parent.title || '】%'
                  )
                """);
    }

    /**
     * 更新 AI 工时评估结果（JSON 整体覆盖）。
     * 纯衍生数据，故意不 touch {@code updated_at}（原因同 {@link #updateDevDocPath}）。
     */
    public void updateDevDocEstimation(String id, String devDocEstimationJson) {
        jdbc.update("UPDATE prd_session SET dev_doc_estimation = ? WHERE id = ?",
                devDocEstimationJson, id);
    }

    /**
     * 更新进度评估文档路径（评估完成时调用）。
     * 故意不 touch {@code updated_at}（原因同 {@link #updateDevDocPath}）。
     */
    public void updateProgressPath(String id, String progressPath) {
        jdbc.update("UPDATE prd_session SET progress_path = ? WHERE id = ?", progressPath, id);
    }

    /** 更新进度评估生成时间戳（评估完成时调用）。 */
    public void updateProgressGeneratedAt(String id, long generatedAt) {
        jdbc.update("UPDATE prd_session SET progress_generated_at = ? WHERE id = ?", generatedAt, id);
    }

    /**
     * 更新进度评估历史（JSON 数组整体覆盖，追加逻辑在 Service 层完成）。
     * 纯记账字段，故意不 touch {@code updated_at}（原因同 {@link #updateDevDocPath}）。
     */
    public void updateProgressHistory(String id, String progressHistoryJson) {
        jdbc.update("UPDATE prd_session SET progress_history = ? WHERE id = ?", progressHistoryJson, id);
    }

    /**
     * 更新草稿字段（保存/再次保存草稿，不改变 DRAFT 状态）。
     *
     * <p>跟其它 update 方法不同，这里故意 touch {@code updated_at}——草稿阶段还没有 PRD/开发文档，
     * 不存在"内容变了但不该影响过期判断"的顾虑，touch updated_at 只是如实反映"草稿最后编辑时间"。</p>
     */
    public void updateDraftFields(String id, String title, String rawInput, String project, String module,
                                  PrdBusinessFields fields) {
        PrdBusinessFields value = fields == null ? PrdBusinessFields.empty() : fields;
        jdbc.update("UPDATE prd_session SET title = ?, raw_input = ?, project = ?, module = ?, " +
                        "requirement_detail = ?, business_background = ?, business_requirement_type = ?, " +
                        "requirement_software = ?, initiating_department = ?, requester = ?, requested_at = ?, " +
                        "source_attachments = ?, follow_up_records = ?, updated_at = ? WHERE id = ?",
                title, rawInput, project, module,
                value.requirementDetail(), value.businessBackground(), value.businessRequirementType(),
                value.requirementSoftware(), value.initiatingDepartment(), value.requester(), value.requestedAt(),
                value.attachments(), value.followUpRecords(), System.currentTimeMillis(), id);
    }

    /**
     * 草稿转正式：把用户在恢复草稿后可能又改过的表单字段（title/rawInput/project/module）连同
     * 「开始澄清」确认弹框里选定的 role/reqType/maxQuestions/clarifyMode 一并写回，状态从
     * DRAFT 切到 CLARIFYING（复用同一行，不新插入一条记录——草稿和正式澄清是同一条需求的
     * 同一个生命周期）。
     */
    public void startClarifyFromDraft(String id, String title, String rawInput, String project, String module,
                                       String model, String engine, String role, String reqType, int maxQuestions,
                                       String clarifyMode, PrdBusinessFields fields) {
        PrdBusinessFields value = fields == null ? PrdBusinessFields.empty() : fields;
        jdbc.update("UPDATE prd_session SET title = ?, raw_input = ?, project = ?, module = ?, model = ?, engine = ?, " +
                        "role = ?, req_type = ?, max_questions = ?, clarify_mode = ?, requirement_detail = ?, " +
                        "business_background = ?, business_requirement_type = ?, requirement_software = ?, " +
                        "initiating_department = ?, requester = ?, requested_at = ?, source_attachments = ?, " +
                        "follow_up_records = ?, status = 'CLARIFYING', updated_at = ? WHERE id = ?",
                title, rawInput, project, module, model, engine, role, reqType, maxQuestions, clarifyMode,
                value.requirementDetail(), value.businessBackground(), value.businessRequirementType(),
                value.requirementSoftware(), value.initiatingDepartment(), value.requester(), value.requestedAt(),
                value.attachments(), value.followUpRecords(),
                System.currentTimeMillis(), id);
    }

    /** 更新会话默认执行引擎；纯元数据，不影响文档过期判断。 */
    public void updateEngine(String id, String engine) {
        jdbc.update("UPDATE prd_session SET engine = ? WHERE id = ?", engine, id);
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
