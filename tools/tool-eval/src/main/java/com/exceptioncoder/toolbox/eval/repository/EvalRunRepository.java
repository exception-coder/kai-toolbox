package com.exceptioncoder.toolbox.eval.repository;

import com.exceptioncoder.toolbox.eval.domain.EvalRun;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Repository
public class EvalRunRepository {

    private static final RowMapper<EvalRun> ROW = (rs, i) -> EvalRun.builder()
            .id(rs.getString("id"))
            .scenario(rs.getString("scenario"))
            .dataset(rs.getString("dataset"))
            .adapter(rs.getString("adapter"))
            .model(rs.getString("model"))
            .promptKey(rs.getString("prompt_key"))
            .promptVersion(rs.getObject("prompt_version") == null ? null : rs.getInt("prompt_version"))
            .status(rs.getString("status"))
            .total(rs.getInt("total"))
            .passed(rs.getInt("passed"))
            .failed(rs.getInt("failed"))
            .errored(rs.getInt("errored"))
            .note(rs.getString("note"))
            .error(rs.getString("error"))
            .startedAt(rs.getLong("started_at"))
            .finishedAt(rs.getObject("finished_at") == null ? null : rs.getLong("finished_at"))
            .build();

    private final JdbcTemplate jdbc;

    public EvalRunRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(EvalRun r) {
        jdbc.update("""
                        INSERT INTO eval_run (id, scenario, dataset, adapter, model, prompt_key, prompt_version,
                                              status, total, passed, failed, errored, note, error, started_at, finished_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                        """,
                r.getId(), r.getScenario(), r.getDataset(), r.getAdapter(), r.getModel(),
                r.getPromptKey(), r.getPromptVersion(), r.getStatus(), r.getTotal(), r.getPassed(),
                r.getFailed(), r.getErrored(), r.getNote(), r.getError(), r.getStartedAt(), r.getFinishedAt());
    }

    public void updateProgress(String runId, int passed, int failed, int errored) {
        jdbc.update("UPDATE eval_run SET passed=?, failed=?, errored=? WHERE id=?", passed, failed, errored, runId);
    }

    public void finish(String runId, String status, String error, long finishedAt) {
        jdbc.update("UPDATE eval_run SET status=?, error=?, finished_at=? WHERE id=?",
                status, error, finishedAt, runId);
    }

    public Optional<EvalRun> findById(String id) {
        List<EvalRun> rows = jdbc.query("SELECT * FROM eval_run WHERE id=?", ROW, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<EvalRun> search(String dataset, int limit) {
        StringBuilder sql = new StringBuilder("SELECT * FROM eval_run WHERE 1=1");
        List<Object> params = new ArrayList<>();
        if (dataset != null && !dataset.isBlank()) {
            sql.append(" AND dataset=?");
            params.add(dataset);
        }
        sql.append(" ORDER BY started_at DESC LIMIT ?");
        params.add(limit);
        return jdbc.query(sql.toString(), ROW, params.toArray());
    }

    public int delete(String id) {
        jdbc.update("DELETE FROM eval_result WHERE run_id=?", id);
        return jdbc.update("DELETE FROM eval_run WHERE id=?", id);
    }
}
