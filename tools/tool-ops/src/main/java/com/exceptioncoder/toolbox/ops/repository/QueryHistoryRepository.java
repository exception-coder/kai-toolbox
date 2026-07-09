package com.exceptioncoder.toolbox.ops.repository;

import com.exceptioncoder.toolbox.ops.domain.QueryHistory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class QueryHistoryRepository {

    private final JdbcTemplate jdbc;

    public QueryHistoryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 列表用：不取 result_json 内容本身（可能较大），只派生 hasResult 标记，保持列表接口轻量。 */
    private static final RowMapper<QueryHistory> LIST_ROW = (rs, i) -> QueryHistory.builder()
            .id(rs.getString("id"))
            .datasourceId(rs.getString("datasource_id"))
            .kind(rs.getString("kind"))
            .content(rs.getString("content"))
            .status(rs.getString("status"))
            .rowCount((Integer) rs.getObject("row_count"))
            .elapsedMs((Long) rs.getObject("elapsed_ms"))
            .errorMsg(rs.getString("error_msg"))
            .hasResult(rs.getInt("has_result") == 1)
            .executedAt(rs.getLong("executed_at"))
            .build();

    private static final RowMapper<QueryHistory> FULL_ROW = (rs, i) -> QueryHistory.builder()
            .id(rs.getString("id"))
            .datasourceId(rs.getString("datasource_id"))
            .kind(rs.getString("kind"))
            .content(rs.getString("content"))
            .status(rs.getString("status"))
            .rowCount((Integer) rs.getObject("row_count"))
            .elapsedMs((Long) rs.getObject("elapsed_ms"))
            .errorMsg(rs.getString("error_msg"))
            .resultJson(rs.getString("result_json"))
            .hasResult(rs.getString("result_json") != null)
            .executedAt(rs.getLong("executed_at"))
            .build();

    public List<QueryHistory> findByDatasource(String datasourceId, int limit) {
        return jdbc.query("""
                SELECT id, datasource_id, kind, content, status, row_count, elapsed_ms, error_msg,
                       executed_at, (result_json IS NOT NULL) AS has_result
                  FROM ops_query_history WHERE datasource_id = ? ORDER BY executed_at DESC LIMIT ?
                """,
                LIST_ROW, datasourceId, limit);
    }

    public Optional<QueryHistory> findById(String id) {
        return jdbc.query("SELECT * FROM ops_query_history WHERE id = ?", FULL_ROW, id)
                .stream().findFirst();
    }

    public void insert(QueryHistory h) {
        jdbc.update("""
                INSERT INTO ops_query_history
                  (id, datasource_id, kind, content, status, row_count, elapsed_ms, error_msg, result_json, executed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                h.getId(), h.getDatasourceId(), h.getKind(), h.getContent(), h.getStatus(),
                h.getRowCount(), h.getElapsedMs(), h.getErrorMsg(), h.getResultJson(), h.getExecutedAt());
    }

    public void deleteByDatasource(String datasourceId) {
        jdbc.update("DELETE FROM ops_query_history WHERE datasource_id = ?", datasourceId);
    }
}
