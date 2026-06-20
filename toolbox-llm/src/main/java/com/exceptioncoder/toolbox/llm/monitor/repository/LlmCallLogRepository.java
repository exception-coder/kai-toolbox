package com.exceptioncoder.toolbox.llm.monitor.repository;

import com.exceptioncoder.toolbox.llm.monitor.LlmCallEvent;
import com.exceptioncoder.toolbox.llm.monitor.dto.CallFilter;
import com.exceptioncoder.toolbox.llm.monitor.dto.CallRow;
import com.exceptioncoder.toolbox.llm.monitor.dto.GroupStat;
import com.exceptioncoder.toolbox.llm.monitor.dto.TsPoint;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/**
 * llm_call_log 的写入与聚合查询。聚合全部在 SQL 层用 GROUP BY + 时间桶完成（确定性）。
 */
@Repository
public class LlmCallLogRepository {

    private final JdbcTemplate jdbc;

    public LlmCallLogRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<CallRow> ROW = (rs, i) -> new CallRow(
            rs.getString("id"),
            rs.getString("created_at"),
            rs.getLong("epoch_ms"),
            rs.getString("tier"),
            rs.getString("model_id"),
            rs.getString("model_name"),
            rs.getString("tool_id"),
            rs.getString("agent"),
            rs.getString("stage"),
            (Integer) rs.getObject("input_tokens"),
            (Integer) rs.getObject("output_tokens"),
            (Integer) rs.getObject("total_tokens"),
            rs.getInt("tokens_estimated") != 0,
            rs.getDouble("cost"),
            rs.getLong("latency_ms"),
            rs.getString("status"),
            rs.getString("finish_reason"),
            rs.getInt("attempt"),
            rs.getString("error_type"),
            rs.getString("error_message"));

    public void batchInsert(List<LlmCallEvent> events) {
        if (events == null || events.isEmpty()) {
            return;
        }
        jdbc.batchUpdate("""
                INSERT INTO llm_call_log
                  (id, created_at, epoch_ms, tier, model_id, model_name, tool_id, agent, stage,
                   input_tokens, output_tokens, total_tokens, tokens_estimated, cost, latency_ms,
                   status, finish_reason, attempt, error_type, error_message, request_chars, response_chars)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, new BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement ps, int i) throws SQLException {
                LlmCallEvent e = events.get(i);
                ps.setString(1, e.id());
                ps.setString(2, e.createdAt());
                ps.setLong(3, e.epochMs());
                ps.setString(4, e.tier());
                ps.setString(5, e.modelId());
                ps.setString(6, e.modelName());
                ps.setString(7, e.toolId());
                ps.setString(8, e.agent());
                ps.setString(9, e.stage());
                ps.setObject(10, e.inputTokens());
                ps.setObject(11, e.outputTokens());
                ps.setObject(12, e.totalTokens());
                ps.setInt(13, e.tokensEstimated() ? 1 : 0);
                ps.setDouble(14, e.cost());
                ps.setLong(15, e.latencyMs());
                ps.setString(16, e.status());
                ps.setString(17, e.finishReason());
                ps.setInt(18, e.attempt());
                ps.setString(19, e.errorType());
                ps.setString(20, e.errorMessage());
                ps.setInt(21, e.requestChars());
                ps.setInt(22, e.responseChars());
            }

            @Override
            public int getBatchSize() {
                return events.size();
            }
        });
    }

    /** 区间总量：calls/in/out/total/cost/avgLatency/errors。 */
    public long[] totals(long fromMs, long toMs, double[] outCostLat) {
        return jdbc.queryForObject("""
                SELECT COUNT(*) calls,
                       COALESCE(SUM(input_tokens),0) in_tok,
                       COALESCE(SUM(output_tokens),0) out_tok,
                       COALESCE(SUM(total_tokens),0) tot_tok,
                       COALESCE(SUM(cost),0) cost,
                       COALESCE(AVG(latency_ms),0) avg_lat,
                       COALESCE(SUM(CASE WHEN status='error' THEN 1 ELSE 0 END),0) errors
                  FROM llm_call_log WHERE epoch_ms >= ? AND epoch_ms < ?
                """, (rs, i) -> {
            long[] v = new long[5];
            v[0] = rs.getLong("calls");
            v[1] = rs.getLong("in_tok");
            v[2] = rs.getLong("out_tok");
            v[3] = rs.getLong("tot_tok");
            v[4] = rs.getLong("errors");
            outCostLat[0] = rs.getDouble("cost");
            outCostLat[1] = rs.getDouble("avg_lat");
            return v;
        }, fromMs, toMs);
    }

    /** 按维度分组统计。groupCol 必须是受信白名单列。 */
    public List<GroupStat> groups(long fromMs, long toMs, String groupCol) {
        String sql = """
                SELECT %s AS gkey, COUNT(*) calls,
                       COALESCE(SUM(total_tokens),0) tot,
                       COALESCE(SUM(cost),0) cost,
                       COALESCE(AVG(latency_ms),0) avg_lat,
                       COALESCE(SUM(CASE WHEN status='error' THEN 1 ELSE 0 END),0) errors,
                       COALESCE(SUM(CASE WHEN tokens_estimated=1 THEN 1 ELSE 0 END),0) est
                  FROM llm_call_log WHERE epoch_ms >= ? AND epoch_ms < ?
                 GROUP BY %s ORDER BY tot DESC
                """.formatted(groupCol, groupCol);
        return jdbc.query(sql, (rs, i) -> {
            long calls = rs.getLong("calls");
            String key = rs.getString("gkey");
            return new GroupStat(
                    key == null ? "(none)" : key,
                    calls,
                    rs.getLong("tot"),
                    rs.getDouble("cost"),
                    calls == 0 ? 0 : (double) rs.getLong("errors") / calls,
                    rs.getLong("avg_lat"),
                    calls == 0 ? 0 : (double) rs.getLong("est") / calls);
        }, fromMs, toMs);
    }

    /** 时间桶序列。bucketLen=13 按小时(substr 到 'YYYY-MM-DDThh')、10 按天。metricExpr 为受信聚合表达式。 */
    public List<TsPoint> timeseries(long fromMs, long toMs, int bucketLen, String metricExpr) {
        String sql = """
                SELECT substr(created_at,1,%d) bucket, %s val
                  FROM llm_call_log WHERE epoch_ms >= ? AND epoch_ms < ?
                 GROUP BY bucket ORDER BY bucket
                """.formatted(bucketLen, metricExpr);
        return jdbc.query(sql, (rs, i) -> new TsPoint(rs.getString("bucket"), rs.getDouble("val")), fromMs, toMs);
    }

    public long countCalls(CallFilter f) {
        List<Object> args = new ArrayList<>();
        String where = buildWhere(f, args);
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM llm_call_log " + where, Long.class, args.toArray());
        return n == null ? 0 : n;
    }

    public List<CallRow> calls(CallFilter f, int offset, int size) {
        List<Object> args = new ArrayList<>();
        String where = buildWhere(f, args);
        args.add(size);
        args.add(offset);
        return jdbc.query("SELECT * FROM llm_call_log " + where
                + " ORDER BY epoch_ms DESC LIMIT ? OFFSET ?", ROW, args.toArray());
    }

    public List<CallRow> slow(long fromMs, long toMs, int limit) {
        return jdbc.query("""
                SELECT * FROM llm_call_log WHERE epoch_ms >= ? AND epoch_ms < ?
                 ORDER BY latency_ms DESC LIMIT ?
                """, ROW, fromMs, toMs, limit);
    }

    /** 启动回填：取某时刻以来的记录用于重建内存水位。 */
    public List<CallRow> findSince(long fromMs) {
        return jdbc.query("SELECT * FROM llm_call_log WHERE epoch_ms >= ?", ROW, fromMs);
    }

    private static String buildWhere(CallFilter f, List<Object> args) {
        StringBuilder w = new StringBuilder("WHERE 1=1");
        if (f.fromMs() != null) {
            w.append(" AND epoch_ms >= ?");
            args.add(f.fromMs());
        }
        if (f.toMs() != null) {
            w.append(" AND epoch_ms < ?");
            args.add(f.toMs());
        }
        if (StringUtils.hasText(f.status())) {
            w.append(" AND status = ?");
            args.add(f.status());
        }
        if (StringUtils.hasText(f.modelId())) {
            w.append(" AND model_id = ?");
            args.add(f.modelId());
        }
        if (StringUtils.hasText(f.toolId())) {
            w.append(" AND tool_id = ?");
            args.add(f.toolId());
        }
        return w.toString();
    }
}
