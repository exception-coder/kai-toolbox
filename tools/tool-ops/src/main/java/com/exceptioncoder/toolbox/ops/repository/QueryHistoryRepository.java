package com.exceptioncoder.toolbox.ops.repository;

import com.exceptioncoder.toolbox.ops.domain.QueryHistory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class QueryHistoryRepository {

    private final JdbcTemplate jdbc;

    public QueryHistoryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<QueryHistory> ROW = (rs, i) -> QueryHistory.builder()
            .id(rs.getString("id"))
            .datasourceId(rs.getString("datasource_id"))
            .kind(rs.getString("kind"))
            .content(rs.getString("content"))
            .status(rs.getString("status"))
            .rowCount((Integer) rs.getObject("row_count"))
            .elapsedMs((Long) rs.getObject("elapsed_ms"))
            .errorMsg(rs.getString("error_msg"))
            .executedAt(rs.getLong("executed_at"))
            .build();

    public List<QueryHistory> findByDatasource(String datasourceId, int limit) {
        return jdbc.query(
                "SELECT * FROM ops_query_history WHERE datasource_id = ? ORDER BY executed_at DESC LIMIT ?",
                ROW, datasourceId, limit);
    }

    public void insert(QueryHistory h) {
        jdbc.update("""
                INSERT INTO ops_query_history
                  (id, datasource_id, kind, content, status, row_count, elapsed_ms, error_msg, executed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                h.getId(), h.getDatasourceId(), h.getKind(), h.getContent(), h.getStatus(),
                h.getRowCount(), h.getElapsedMs(), h.getErrorMsg(), h.getExecutedAt());
    }

    public void deleteByDatasource(String datasourceId) {
        jdbc.update("DELETE FROM ops_query_history WHERE datasource_id = ?", datasourceId);
    }
}
