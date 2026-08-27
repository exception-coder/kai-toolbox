package com.exceptioncoder.toolbox.reqpool.repository;

import com.exceptioncoder.toolbox.reqpool.domain.ReqInsightRun;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** 价值判定后台运行账本的数据访问入口。 */
@Repository
public class ReqInsightRunRepository {

    private static final String COLUMNS = """
            id, item_id, title_snapshot, description_snapshot, project_snapshot, module_snapshot,
            source_hash, evidence_trace_json, engine, status, stage, error_message,
            started_at, completed_at, created_at, updated_at
            """;
    private static final RowMapper<ReqInsightRun> ROW = (rs, rowNumber) -> new ReqInsightRun(
            rs.getString("id"), rs.getString("item_id"), rs.getString("title_snapshot"),
            rs.getString("description_snapshot"), rs.getString("project_snapshot"),
            rs.getString("module_snapshot"), rs.getString("source_hash"),
            rs.getString("evidence_trace_json"), rs.getString("engine"), rs.getString("status"),
            rs.getString("stage"), rs.getString("error_message"), rs.getLong("started_at"),
            nullableLong(rs.getObject("completed_at")), rs.getLong("created_at"), rs.getLong("updated_at"));

    private final JdbcTemplate jdbc;

    public ReqInsightRunRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean insert(ReqInsightRun run) {
        try {
            jdbc.update("""
                    INSERT INTO req_pool_insight_run
                      (id, item_id, title_snapshot, description_snapshot, project_snapshot, module_snapshot,
                       source_hash, evidence_trace_json, engine, status, stage, error_message,
                       started_at, completed_at, created_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """, run.id(), run.itemId(), run.titleSnapshot(), run.descriptionSnapshot(),
                    run.projectSnapshot(), run.moduleSnapshot(), run.sourceHash(), run.evidenceTraceJson(),
                    run.engine(), run.status(), run.stage(), run.errorMessage(), run.startedAt(),
                    run.completedAt(), run.createdAt(), run.updatedAt());
            return true;
        } catch (DuplicateKeyException ignored) {
            return false;
        }
    }

    public Optional<ReqInsightRun> findById(String id) {
        return first(jdbc.query("SELECT " + COLUMNS + " FROM req_pool_insight_run WHERE id=?", ROW, id));
    }

    public Optional<ReqInsightRun> findActiveByItemId(String itemId) {
        return first(jdbc.query("SELECT " + COLUMNS + " FROM req_pool_insight_run "
                + "WHERE item_id=? AND status='RUNNING' ORDER BY created_at DESC LIMIT 1", ROW, itemId));
    }

    public List<ReqInsightRun> findRunning() {
        return jdbc.query("SELECT " + COLUMNS + " FROM req_pool_insight_run "
                + "WHERE status='RUNNING' ORDER BY created_at", ROW);
    }

    public Map<String, ReqInsightRun> findLatestByItemIds(List<String> itemIds) {
        if (itemIds.isEmpty()) return Map.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(itemIds.size(), "?"));
        List<ReqInsightRun> rows = jdbc.query("SELECT " + COLUMNS + " FROM req_pool_insight_run WHERE item_id IN ("
                + placeholders + ") ORDER BY item_id, created_at DESC, id DESC", ROW, itemIds.toArray());
        Map<String, ReqInsightRun> latest = new LinkedHashMap<>();
        rows.forEach(run -> latest.putIfAbsent(run.itemId(), run));
        return Map.copyOf(latest);
    }

    public boolean markAnalyzing(String id, long updatedAt) {
        return jdbc.update("UPDATE req_pool_insight_run SET stage='ANALYZING', updated_at=? "
                + "WHERE id=? AND status='RUNNING'", updatedAt, id) == 1;
    }

    public boolean markDiscovering(String id, long updatedAt) {
        return jdbc.update("UPDATE req_pool_insight_run SET stage='DISCOVERING', updated_at=? "
                + "WHERE id=? AND status='RUNNING'", updatedAt, id) == 1;
    }

    public boolean updateEvidenceTrace(String id, String evidenceTraceJson, long updatedAt) {
        return jdbc.update("UPDATE req_pool_insight_run SET evidence_trace_json=?, updated_at=? "
                + "WHERE id=? AND status='RUNNING'", evidenceTraceJson, updatedAt, id) == 1;
    }

    public boolean complete(String id, long completedAt) {
        return jdbc.update("UPDATE req_pool_insight_run SET status='COMPLETED', stage='COMPLETED', "
                + "error_message=NULL, completed_at=?, updated_at=? WHERE id=? AND status='RUNNING'",
                completedAt, completedAt, id) == 1;
    }

    public boolean fail(String id, String errorMessage, long completedAt) {
        return jdbc.update("UPDATE req_pool_insight_run SET status='FAILED', stage='FAILED', "
                + "error_message=?, completed_at=?, updated_at=? WHERE id=? AND status='RUNNING'",
                errorMessage, completedAt, completedAt, id) == 1;
    }

    public void deleteByItemId(String itemId) {
        jdbc.update("DELETE FROM req_pool_insight_run WHERE item_id=?", itemId);
    }

    private static Optional<ReqInsightRun> first(List<ReqInsightRun> rows) {
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.getFirst());
    }

    private static Long nullableLong(Object value) {
        return value instanceof Number number ? number.longValue() : null;
    }
}
