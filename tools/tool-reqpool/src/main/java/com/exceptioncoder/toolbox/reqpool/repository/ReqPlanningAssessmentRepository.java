package com.exceptioncoder.toolbox.reqpool.repository;

import com.exceptioncoder.toolbox.reqpool.domain.ReqPlanningAssessment;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** 规划评估运行账本的数据访问能力。 */
@Repository
public class ReqPlanningAssessmentRepository {

    private static final String COLUMNS = """
            id, item_id, prd_session_id, input_hash, input_snapshot, evidence_trace_json, criteria_version,
            prompt_version, status, raw_output_json, payload_json, engine, model, error_message,
            started_at, completed_at, created_at, updated_at
            """;

    private static final RowMapper<ReqPlanningAssessment> ROW = (resultSet, rowNumber) ->
            ReqPlanningAssessment.builder()
                    .id(resultSet.getString("id"))
                    .itemId(resultSet.getString("item_id"))
                    .prdSessionId(resultSet.getString("prd_session_id"))
                    .inputHash(resultSet.getString("input_hash"))
                    .inputSnapshot(resultSet.getString("input_snapshot"))
                    .evidenceTraceJson(resultSet.getString("evidence_trace_json"))
                    .criteriaVersion(resultSet.getString("criteria_version"))
                    .promptVersion(resultSet.getString("prompt_version"))
                    .status(resultSet.getString("status"))
                    .rawOutputJson(resultSet.getString("raw_output_json"))
                    .payloadJson(resultSet.getString("payload_json"))
                    .engine(resultSet.getString("engine"))
                    .model(resultSet.getString("model"))
                    .errorMessage(resultSet.getString("error_message"))
                    .startedAt(resultSet.getLong("started_at"))
                    .completedAt(nullableLong(resultSet.getObject("completed_at")))
                    .createdAt(resultSet.getLong("created_at"))
                    .updatedAt(resultSet.getLong("updated_at"))
                    .build();

    private final JdbcTemplate jdbc;

    public ReqPlanningAssessmentRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 插入运行；同输入已有进行中或已完成记录时返回 false。 */
    public boolean insert(ReqPlanningAssessment assessment) {
        try {
            jdbc.update("""
                    INSERT INTO req_pool_planning_assessment
                      (id, item_id, prd_session_id, input_hash, input_snapshot, evidence_trace_json, criteria_version,
                       prompt_version, status, raw_output_json, payload_json, engine, model,
                       error_message, started_at, completed_at, created_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    assessment.getId(), assessment.getItemId(), assessment.getPrdSessionId(),
                    assessment.getInputHash(), assessment.getInputSnapshot(), assessment.getEvidenceTraceJson(), assessment.getCriteriaVersion(),
                    assessment.getPromptVersion(), assessment.getStatus(), assessment.getRawOutputJson(),
                    assessment.getPayloadJson(), assessment.getEngine(), assessment.getModel(),
                    assessment.getErrorMessage(), assessment.getStartedAt(), assessment.getCompletedAt(),
                    assessment.getCreatedAt(), assessment.getUpdatedAt());
            return true;
        } catch (DuplicateKeyException ignored) {
            return false;
        }
    }

    /** 查找同一规格输入可复用的进行中或已完成运行。 */
    public Optional<ReqPlanningAssessment> findReusable(
            String prdSessionId,
            String inputHash,
            String criteriaVersion
    ) {
        return first(jdbc.query("SELECT " + COLUMNS + " FROM req_pool_planning_assessment "
                        + "WHERE prd_session_id=? AND input_hash=? AND criteria_version=? "
                        + "AND status IN ('RUNNING','COMPLETED') "
                        + "ORDER BY CASE status WHEN 'COMPLETED' THEN 0 ELSE 1 END, created_at DESC LIMIT 1",
                ROW, prdSessionId, inputHash, criteriaVersion));
    }

    /** 按运行 ID 查询。 */
    public Optional<ReqPlanningAssessment> findById(String id) {
        return first(jdbc.query(
                "SELECT " + COLUMNS + " FROM req_pool_planning_assessment WHERE id=?",
                ROW, id));
    }

    /** 查询需求最近一次规划评估。 */
    public Optional<ReqPlanningAssessment> findLatestByItemId(String itemId) {
        return first(jdbc.query("SELECT " + COLUMNS + " FROM req_pool_planning_assessment "
                        + "WHERE item_id=? ORDER BY created_at DESC, id DESC LIMIT 1",
                ROW, itemId));
    }

    /** 批量查询每条需求最近一次规划评估，避免列表装配产生 N+1。 */
    public Map<String, ReqPlanningAssessment> findLatestByItemIds(List<String> itemIds) {
        if (itemIds.isEmpty()) {
            return Map.of();
        }
        String placeholders = String.join(",", java.util.Collections.nCopies(itemIds.size(), "?"));
        List<ReqPlanningAssessment> rows = jdbc.query(
                "SELECT " + COLUMNS + " FROM req_pool_planning_assessment WHERE item_id IN ("
                        + placeholders + ") ORDER BY item_id, created_at DESC, id DESC",
                ROW, itemIds.toArray());
        Map<String, ReqPlanningAssessment> latest = new LinkedHashMap<>();
        for (ReqPlanningAssessment row : rows) {
            latest.putIfAbsent(row.getItemId(), row);
        }
        return Map.copyOf(latest);
    }

    /** 原子完成仍处于 RUNNING 的运行。 */
    public boolean complete(String id, String rawOutputJson, String payloadJson, long completedAt) {
        return jdbc.update("""
                UPDATE req_pool_planning_assessment
                SET status='COMPLETED', raw_output_json=?, payload_json=?, error_message=NULL,
                    completed_at=?, updated_at=?
                WHERE id=? AND status='RUNNING'
                """, rawOutputJson, payloadJson, completedAt, completedAt, id) == 1;
    }

    /** 原子标记仍处于 RUNNING 的运行为失败。 */
    public boolean fail(String id, String errorMessage, long completedAt) {
        return jdbc.update("""
                UPDATE req_pool_planning_assessment
                SET status='FAILED', error_message=?, completed_at=?, updated_at=?
                WHERE id=? AND status='RUNNING'
                """, errorMessage, completedAt, completedAt, id) == 1;
    }

    /** 删除需求时清理对应规划评估历史。 */
    public void deleteByItemId(String itemId) {
        jdbc.update("DELETE FROM req_pool_planning_assessment WHERE item_id=?", itemId);
    }

    private static Optional<ReqPlanningAssessment> first(List<ReqPlanningAssessment> rows) {
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.getFirst());
    }

    private static Long nullableLong(Object value) {
        return value instanceof Number number ? number.longValue() : null;
    }
}
