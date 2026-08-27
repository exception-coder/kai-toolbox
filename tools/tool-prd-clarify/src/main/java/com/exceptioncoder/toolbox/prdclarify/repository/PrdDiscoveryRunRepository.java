package com.exceptioncoder.toolbox.prdclarify.repository;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdDiscoveryRun;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** `prd_discovery_run` 的唯一 SQL 访问边界。 */
@Repository
public class PrdDiscoveryRunRepository {

    private static final String COLUMNS = """
            id, session_id, status, stage, progress, attempt, max_attempts,
            criteria_version, prompt_version, input_hash, engine, model,
            vibe_session_id, trace_id, evidence_trace_json, last_output, validation_json, last_error,
            started_at, completed_at, created_at, updated_at
            """;

    private final JdbcTemplate jdbc;

    public PrdDiscoveryRunRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean insert(PrdDiscoveryRun run) {
        try {
            jdbc.update("""
                    INSERT INTO prd_discovery_run (
                      id, session_id, status, stage, progress, attempt, max_attempts,
                      criteria_version, prompt_version, input_hash, engine, model,
                      vibe_session_id, trace_id, evidence_trace_json, last_output, validation_json, last_error,
                      started_at, completed_at, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    run.id(), run.sessionId(), run.status(), run.stage(), run.progress(), run.attempt(),
                    run.maxAttempts(), run.criteriaVersion(), run.promptVersion(), run.inputHash(),
                    run.engine(), run.model(), run.vibeSessionId(), run.traceId(), run.evidenceTraceJson(), run.lastOutput(),
                    run.validationJson(), run.lastError(), run.startedAt(), run.completedAt(),
                    run.createdAt(), run.updatedAt());
            return true;
        } catch (org.springframework.dao.DuplicateKeyException ignored) {
            return false;
        }
    }

    public Optional<PrdDiscoveryRun> findById(String id) {
        return first(jdbc.query("SELECT " + COLUMNS + " FROM prd_discovery_run WHERE id = ?", ROW, id));
    }

    public Optional<PrdDiscoveryRun> findLatestBySessionId(String sessionId) {
        return first(jdbc.query("""
                SELECT %s FROM prd_discovery_run
                WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 1
                """.formatted(COLUMNS), ROW, sessionId));
    }

    public Optional<PrdDiscoveryRun> findRunningBySessionId(String sessionId) {
        return first(jdbc.query("""
                SELECT %s FROM prd_discovery_run
                WHERE session_id = ? AND status = 'RUNNING'
                ORDER BY created_at DESC, id DESC LIMIT 1
                """.formatted(COLUMNS), ROW, sessionId));
    }

    public List<PrdDiscoveryRun> findRunning() {
        return jdbc.query("SELECT " + COLUMNS + " FROM prd_discovery_run WHERE status = 'RUNNING'", ROW);
    }

    public void updateAttempt(String id, int attempt, String stage, int progress, String lastError) {
        jdbc.update("""
                UPDATE prd_discovery_run
                SET attempt=?, stage=?, progress=?, last_error=?, updated_at=?
                WHERE id=? AND status='RUNNING'
                """, attempt, stage, progress, lastError, System.currentTimeMillis(), id);
    }

    public void recordAgentResult(String id, String vibeSessionId, String traceId, String output) {
        jdbc.update("""
                UPDATE prd_discovery_run
                SET vibe_session_id=?, trace_id=?, last_output=?, updated_at=?
                WHERE id=? AND status='RUNNING'
                """, vibeSessionId, traceId, output, System.currentTimeMillis(), id);
    }

    public void recordEvidenceTrace(String id, String evidenceTraceJson) {
        jdbc.update("""
                UPDATE prd_discovery_run SET evidence_trace_json=?, updated_at=?
                WHERE id=? AND status='RUNNING'
                """, evidenceTraceJson, System.currentTimeMillis(), id);
    }

    public void recordValidation(String id, String validationJson) {
        jdbc.update("""
                UPDATE prd_discovery_run SET validation_json=?, updated_at=?
                WHERE id=? AND status='RUNNING'
                """, validationJson, System.currentTimeMillis(), id);
    }

    public boolean complete(String id, String validationJson, long completedAt) {
        return jdbc.update("""
                UPDATE prd_discovery_run
                SET status='COMPLETED', stage='COMPLETED', progress=100, validation_json=?,
                    last_error=NULL, completed_at=?, updated_at=?
                WHERE id=? AND status='RUNNING'
                """, validationJson, completedAt, completedAt, id) == 1;
    }

    public boolean fail(String id, String validationJson, String error, long completedAt) {
        return jdbc.update("""
                UPDATE prd_discovery_run
                SET status='FAILED', stage='FAILED', progress=100, validation_json=?,
                    last_error=?, completed_at=?, updated_at=?
                WHERE id=? AND status='RUNNING'
                """, validationJson, error, completedAt, completedAt, id) == 1;
    }

    private static final org.springframework.jdbc.core.RowMapper<PrdDiscoveryRun> ROW = (rs, row) ->
            new PrdDiscoveryRun(
                    rs.getString("id"), rs.getString("session_id"), rs.getString("status"),
                    rs.getString("stage"), rs.getInt("progress"), rs.getInt("attempt"),
                    rs.getInt("max_attempts"), rs.getString("criteria_version"),
                    rs.getString("prompt_version"), rs.getString("input_hash"), rs.getString("engine"),
                    rs.getString("model"), rs.getString("vibe_session_id"), rs.getString("trace_id"),
                    rs.getString("evidence_trace_json"), rs.getString("last_output"),
                    rs.getString("validation_json"), rs.getString("last_error"),
                    rs.getLong("started_at"), nullableLong(rs, "completed_at"),
                    rs.getLong("created_at"), rs.getLong("updated_at"));

    private static Optional<PrdDiscoveryRun> first(List<PrdDiscoveryRun> rows) {
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.getFirst());
    }

    private static Long nullableLong(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }
}
