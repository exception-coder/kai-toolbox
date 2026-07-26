package com.exceptioncoder.toolbox.eval.repository;

import com.exceptioncoder.toolbox.eval.domain.EvalResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class EvalResultRepository {

    private static final RowMapper<EvalResult> ROW = (rs, i) -> EvalResult.builder()
            .id(rs.getString("id"))
            .runId(rs.getString("run_id"))
            .caseId(rs.getString("case_id"))
            .caseTitle(rs.getString("case_title"))
            .verdict(rs.getString("verdict"))
            .score(rs.getDouble("score"))
            .outputJson(rs.getString("output_json"))
            .rawOutput(rs.getString("raw_output"))
            .assertionsJson(rs.getString("assertions_json"))
            .error(rs.getString("error"))
            .latencyMs(rs.getLong("latency_ms"))
            .createdAt(rs.getLong("created_at"))
            .build();

    private final JdbcTemplate jdbc;

    public EvalResultRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(EvalResult r) {
        jdbc.update("""
                        INSERT INTO eval_result (id, run_id, case_id, case_title, verdict, score, output_json,
                                                 raw_output, assertions_json, error, latency_ms, created_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                        """,
                r.getId(), r.getRunId(), r.getCaseId(), r.getCaseTitle(), r.getVerdict(), r.getScore(),
                r.getOutputJson(), r.getRawOutput(), r.getAssertionsJson(), r.getError(),
                r.getLatencyMs(), r.getCreatedAt());
    }

    public List<EvalResult> findByRun(String runId) {
        return jdbc.query("SELECT * FROM eval_result WHERE run_id=? ORDER BY created_at ASC", ROW, runId);
    }

    /**
     * 两次 run 的逐用例对比。用 case_id 全外连接语义（SQLite 无 FULL OUTER JOIN，用 UNION 模拟），
     * 只有同时出现在两侧的用例才有可比性；单侧独有的用例标记为 ONLY_BASE / ONLY_TARGET。
     */
    public List<DiffRow> diff(String baseRunId, String targetRunId) {
        return jdbc.query("""
                        SELECT c.id            AS case_id,
                               c.title         AS case_title,
                               b.verdict       AS base_verdict,
                               b.score         AS base_score,
                               t.verdict       AS target_verdict,
                               t.score         AS target_score,
                               t.error         AS target_error,
                               t.assertions_json AS target_assertions
                        FROM eval_case c
                        LEFT JOIN eval_result b ON b.case_id = c.id AND b.run_id = ?
                        LEFT JOIN eval_result t ON t.case_id = c.id AND t.run_id = ?
                        WHERE b.id IS NOT NULL OR t.id IS NOT NULL
                        ORDER BY c.created_at ASC
                        """,
                (rs, i) -> new DiffRow(
                        rs.getString("case_id"),
                        rs.getString("case_title"),
                        rs.getString("base_verdict"),
                        rs.getObject("base_score") == null ? null : rs.getDouble("base_score"),
                        rs.getString("target_verdict"),
                        rs.getObject("target_score") == null ? null : rs.getDouble("target_score"),
                        rs.getString("target_error"),
                        rs.getString("target_assertions")),
                baseRunId, targetRunId);
    }

    public record DiffRow(
            String caseId,
            String caseTitle,
            String baseVerdict,
            Double baseScore,
            String targetVerdict,
            Double targetScore,
            String targetError,
            String targetAssertions
    ) {
    }
}
