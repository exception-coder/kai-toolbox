package com.exceptioncoder.toolbox.prdclarify.repository;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdAiRun;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdAiRunStatus;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptPurpose;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** `prd_ai_run` 的唯一 SQL 访问边界。 */
@Repository
public class PrdAiRunRepository {

    private final JdbcTemplate jdbc;

    public PrdAiRunRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 插入一条尚未结束的运行记录。 */
    public void insert(PrdAiRun run) {
        jdbc.update("""
                INSERT INTO prd_ai_run (
                  id, session_id, purpose, prompt_version, prompt_sha256, input_fingerprint,
                  engine, model, candidate_id, artifact_id, status, output_sha256, last_error,
                  started_at, finished_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                run.id(), run.sessionId(), run.purpose().name(), run.promptVersion(), run.promptSha256(),
                run.inputFingerprint(), run.engine(), run.model(), run.candidateId(), run.artifactId(),
                run.status().name(), run.outputSha256(), run.lastError(), run.startedAt(), run.finishedAt(),
                run.createdAt(), run.updatedAt());
    }

    /** 仅允许尚在 RUNNING 的记录结束一次。 */
    public boolean complete(String id, PrdAiRunStatus status, String outputSha256,
                            String lastError, long finishedAt) {
        int updated = jdbc.update("""
                UPDATE prd_ai_run
                SET status = ?, output_sha256 = ?, last_error = ?, finished_at = ?, updated_at = ?
                WHERE id = ? AND status = 'RUNNING'
                """, status.name(), outputSha256, lastError, finishedAt, finishedAt, id);
        return updated == 1;
    }

    /** 将一组阶段运行关联到最终候选。 */
    public void bindCandidate(List<String> runIds, String candidateId) {
        for (String runId : runIds) {
            jdbc.update("""
                    UPDATE prd_ai_run
                    SET candidate_id = ?, updated_at = ?
                    WHERE id = ? AND candidate_id IS NULL
                    """, candidateId, System.currentTimeMillis(), runId);
        }
    }

    /** 将运行关联到最终产物。 */
    public void bindArtifact(String runId, String artifactId) {
        jdbc.update("""
                UPDATE prd_ai_run
                SET artifact_id = ?, updated_at = ?
                WHERE id = ? AND artifact_id IS NULL
                """, artifactId, System.currentTimeMillis(), runId);
    }

    /** 按身份读取审计记录。 */
    public Optional<PrdAiRun> findById(String id) {
        List<PrdAiRun> rows = jdbc.query("""
                SELECT id, session_id, purpose, prompt_version, prompt_sha256, input_fingerprint,
                       engine, model, candidate_id, artifact_id, status, output_sha256, last_error,
                       started_at, finished_at, created_at, updated_at
                FROM prd_ai_run
                WHERE id = ?
                """, (resultSet, rowNumber) -> new PrdAiRun(
                resultSet.getString("id"), resultSet.getString("session_id"),
                PrdPromptPurpose.valueOf(resultSet.getString("purpose")),
                resultSet.getString("prompt_version"), resultSet.getString("prompt_sha256"),
                resultSet.getString("input_fingerprint"), resultSet.getString("engine"),
                resultSet.getString("model"), resultSet.getString("candidate_id"),
                resultSet.getString("artifact_id"), PrdAiRunStatus.valueOf(resultSet.getString("status")),
                resultSet.getString("output_sha256"), resultSet.getString("last_error"),
                resultSet.getLong("started_at"), nullableLong(resultSet, "finished_at"),
                resultSet.getLong("created_at"), resultSet.getLong("updated_at")), id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    private static Long nullableLong(java.sql.ResultSet resultSet, String column) throws java.sql.SQLException {
        long value = resultSet.getLong(column);
        return resultSet.wasNull() ? null : value;
    }
}
