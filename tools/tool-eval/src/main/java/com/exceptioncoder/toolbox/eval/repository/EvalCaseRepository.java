package com.exceptioncoder.toolbox.eval.repository;

import com.exceptioncoder.toolbox.eval.domain.EvalCase;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Repository
public class EvalCaseRepository {

    private static final RowMapper<EvalCase> ROW = (rs, i) -> EvalCase.builder()
            .id(rs.getString("id"))
            .scenario(rs.getString("scenario"))
            .dataset(rs.getString("dataset"))
            .title(rs.getString("title"))
            .inputJson(rs.getString("input_json"))
            .expectedJson(rs.getString("expected_json"))
            .assertJson(rs.getString("assert_json"))
            .tags(rs.getString("tags"))
            .sourceRef(rs.getString("source_ref"))
            .enabled(rs.getInt("enabled") == 1)
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    private final JdbcTemplate jdbc;

    public EvalCaseRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(EvalCase c) {
        jdbc.update("""
                        INSERT INTO eval_case (id, scenario, dataset, title, input_json, expected_json,
                                               assert_json, tags, source_ref, enabled, created_at, updated_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                        """,
                c.getId(), c.getScenario(), c.getDataset(), c.getTitle(), c.getInputJson(), c.getExpectedJson(),
                c.getAssertJson(), c.getTags(), c.getSourceRef(), c.isEnabled() ? 1 : 0,
                c.getCreatedAt(), c.getUpdatedAt());
    }

    public void update(EvalCase c) {
        jdbc.update("""
                        UPDATE eval_case SET scenario=?, dataset=?, title=?, input_json=?, expected_json=?,
                                             assert_json=?, tags=?, source_ref=?, enabled=?, updated_at=?
                        WHERE id=?
                        """,
                c.getScenario(), c.getDataset(), c.getTitle(), c.getInputJson(), c.getExpectedJson(),
                c.getAssertJson(), c.getTags(), c.getSourceRef(), c.isEnabled() ? 1 : 0,
                c.getUpdatedAt(), c.getId());
    }

    public Optional<EvalCase> findById(String id) {
        List<EvalCase> rows = jdbc.query("SELECT * FROM eval_case WHERE id=?", ROW, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /** 按数据集取待跑用例；{@code onlyEnabled} 为真时跳过停用项。 */
    public List<EvalCase> findByDataset(String dataset, boolean onlyEnabled) {
        StringBuilder sql = new StringBuilder("SELECT * FROM eval_case WHERE dataset=?");
        List<Object> params = new ArrayList<>();
        params.add(dataset);
        if (onlyEnabled) {
            sql.append(" AND enabled=1");
        }
        sql.append(" ORDER BY created_at ASC");
        return jdbc.query(sql.toString(), ROW, params.toArray());
    }

    public List<EvalCase> search(String scenario, String dataset) {
        StringBuilder sql = new StringBuilder("SELECT * FROM eval_case WHERE 1=1");
        List<Object> params = new ArrayList<>();
        if (scenario != null && !scenario.isBlank()) {
            sql.append(" AND scenario=?");
            params.add(scenario);
        }
        if (dataset != null && !dataset.isBlank()) {
            sql.append(" AND dataset=?");
            params.add(dataset);
        }
        sql.append(" ORDER BY dataset ASC, created_at DESC LIMIT 500");
        return jdbc.query(sql.toString(), ROW, params.toArray());
    }

    /** 数据集清单 + 各自用例数，供前端下拉。 */
    public List<DatasetStat> listDatasets() {
        return jdbc.query("""
                        SELECT scenario, dataset, COUNT(*) AS total,
                               SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) AS enabled_count
                        FROM eval_case GROUP BY scenario, dataset ORDER BY scenario, dataset
                        """,
                (rs, i) -> new DatasetStat(rs.getString("scenario"), rs.getString("dataset"),
                        rs.getInt("total"), rs.getInt("enabled_count")));
    }

    public boolean existsBySourceRef(String sourceRef) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM eval_case WHERE source_ref=?", Integer.class, sourceRef);
        return n != null && n > 0;
    }

    public int delete(String id) {
        return jdbc.update("DELETE FROM eval_case WHERE id=?", id);
    }

    public record DatasetStat(String scenario, String dataset, int total, int enabledCount) {
    }
}
