package com.exceptioncoder.toolbox.browserrequest.repository;

import com.exceptioncoder.toolbox.browserrequest.domain.PipelineRun;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class PipelineRunRepository {

    private final JdbcTemplate jdbc;

    private final RowMapper<PipelineRun> ROW = (rs, i) -> PipelineRun.builder()
            .id(rs.getString("id"))
            .pipelineId(rs.getString("pipeline_id"))
            .sessionId(rs.getString("session_id"))
            .startedAt(rs.getLong("started_at"))
            .finishedAt(rs.getObject("finished_at") != null ? rs.getLong("finished_at") : null)
            .status(rs.getString("status"))
            .dryRun(rs.getInt("dry_run") == 1)
            .summaryJson(rs.getString("summary_json"))
            .failuresJson(rs.getString("failures_json"))
            .build();

    public PipelineRunRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(PipelineRun r) {
        jdbc.update("""
                INSERT INTO browser_request_pipeline_run
                  (id, pipeline_id, session_id, started_at, finished_at, status, dry_run, summary_json, failures_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                r.getId(), r.getPipelineId(), r.getSessionId(),
                r.getStartedAt(), r.getFinishedAt(), r.getStatus(),
                r.isDryRun() ? 1 : 0, r.getSummaryJson(), r.getFailuresJson());
    }

    /** 运行结束时写入终态（status / finished_at / summary / failures）。 */
    public void finish(String id, String status, long finishedAt, String summaryJson, String failuresJson) {
        jdbc.update("""
                UPDATE browser_request_pipeline_run
                SET status = ?, finished_at = ?, summary_json = ?, failures_json = ?
                WHERE id = ?
                """, status, finishedAt, summaryJson, failuresJson, id);
    }

    public Optional<PipelineRun> findById(String id) {
        List<PipelineRun> rs = jdbc.query("SELECT * FROM browser_request_pipeline_run WHERE id = ?", ROW, id);
        return rs.isEmpty() ? Optional.empty() : Optional.of(rs.get(0));
    }

    /** 列出某 pipeline 最近 N 次运行（不含 failures_json 节省带宽）。 */
    public List<PipelineRun> listRecent(String pipelineId, int limit) {
        return jdbc.query(
                "SELECT id, pipeline_id, session_id, started_at, finished_at, status, dry_run, summary_json, NULL AS failures_json " +
                "FROM browser_request_pipeline_run WHERE pipeline_id = ? ORDER BY started_at DESC LIMIT ?",
                ROW, pipelineId, limit);
    }

    public int deleteByPipeline(String pipelineId) {
        return jdbc.update("DELETE FROM browser_request_pipeline_run WHERE pipeline_id = ?", pipelineId);
    }

    public int deleteBySession(String sessionId) {
        return jdbc.update("DELETE FROM browser_request_pipeline_run WHERE session_id = ?", sessionId);
    }
}
