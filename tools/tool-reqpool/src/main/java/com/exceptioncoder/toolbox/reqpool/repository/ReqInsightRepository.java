package com.exceptioncoder.toolbox.reqpool.repository;

import com.exceptioncoder.toolbox.reqpool.domain.ReqInsight;
import com.exceptioncoder.toolbox.reqpool.domain.ReqInsightType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/** AI 洞察历史与兼容投影的唯一 SQL 容器。 */
@Repository
public class ReqInsightRepository {

    private static final RowMapper<ReqInsight> ROW_MAPPER = (resultSet, rowNumber) -> new ReqInsight(
            resultSet.getString("id"),
            resultSet.getString("item_id"),
            ReqInsightType.valueOf(resultSet.getString("analysis_type")),
            resultSet.getString("prompt_version"),
            resultSet.getString("source_hash"),
            resultSet.getString("portfolio_set_hash"),
            resultSet.getString("payload_json"),
            resultSet.getString("engine"),
            resultSet.getString("model"),
            resultSet.getLong("created_at")
    );

    private final JdbcTemplate jdbc;

    public ReqInsightRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(ReqInsight insight) {
        jdbc.update("""
                INSERT INTO req_pool_insight
                  (id, item_id, analysis_type, prompt_version, source_hash, portfolio_set_hash,
                   payload_json, engine, model, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                insight.id(), insight.itemId(), insight.analysisType().name(), insight.promptVersion(),
                insight.sourceHash(), insight.portfolioSetHash(), insight.payloadJson(), insight.engine(),
                insight.model(), insight.createdAt(), insight.createdAt());
    }

    public void updateCurrentProjection(String itemId, String payloadJson, long updatedAt) {
        int updated = jdbc.update(
                "UPDATE req_pool_item SET ai_insight = ?, updated_at = ? WHERE id = ?",
                payloadJson, updatedAt, itemId);
        if (updated != 1) {
            throw new IllegalStateException("需求洞察投影目标不存在: " + itemId);
        }
    }

    public Map<String, ReqInsight> findLatestByItemIds(Collection<String> itemIds) {
        if (itemIds.isEmpty()) {
            return Map.of();
        }
        String placeholders = String.join(",", itemIds.stream().map(id -> "?").toList());
        String sql = """
                SELECT id, item_id, analysis_type, prompt_version, source_hash, portfolio_set_hash,
                       payload_json, engine, model, created_at
                FROM req_pool_insight
                WHERE item_id IN (%s)
                ORDER BY created_at DESC, id DESC
                """.formatted(placeholders);
        Map<String, ReqInsight> latest = new LinkedHashMap<>();
        jdbc.query(sql, ROW_MAPPER, itemIds.toArray()).forEach(
                insight -> latest.putIfAbsent(insight.itemId(), insight));
        return latest;
    }
}
