package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.api.dto.HistoryDetailView;
import com.exceptioncoder.toolbox.ops.api.dto.RedisExecResult;
import com.exceptioncoder.toolbox.ops.api.dto.SqlQueryResult;
import com.exceptioncoder.toolbox.ops.api.dto.TestResult;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import com.exceptioncoder.toolbox.ops.domain.QueryHistory;
import com.exceptioncoder.toolbox.ops.repository.QueryHistoryRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 查询编排：按中间件类型分派到对应连接器，记录查询历史（含结果快照）。 */
@Service
public class OpsQueryService {

    /** 历史快照最多存的行数：独立于查询本身的 maxRows，避免一次大查询把 SQLite 撑爆。 */
    private static final int SNAPSHOT_MAX_ROWS = 200;
    /** 序列化后超过此字节数则不存快照（仅 NULL，不存半份数据）。 */
    private static final int SNAPSHOT_MAX_BYTES = 200_000;

    private final OpsDatasourceService datasources;
    private final QueryHistoryRepository histories;
    private final SqlConnector sqlConnector;
    private final RedisConnector redisConnector;
    private final ObjectMapper mapper;

    public OpsQueryService(OpsDatasourceService datasources, QueryHistoryRepository histories,
                           SqlConnector sqlConnector, RedisConnector redisConnector, ObjectMapper mapper) {
        this.datasources = datasources;
        this.histories = histories;
        this.sqlConnector = sqlConnector;
        this.redisConnector = redisConnector;
        this.mapper = mapper;
    }

    public TestResult test(String datasourceId) {
        OpsDatasource ds = datasources.findRequired(datasourceId);
        return switch (ds.getType().category()) {
            case SQL -> sqlConnector.test(ds);
            case REDIS -> redisConnector.test(ds);
            case MQ, OTHER -> new TestResult(false, "该类型连接测试暂未实现（仅登记）", 0);
        };
    }

    public SqlQueryResult sqlQuery(String datasourceId, String sql, Integer maxRows) {
        OpsDatasource ds = datasources.findRequired(datasourceId);
        if (ds.getType().category() != DatasourceType.Category.SQL) {
            throw new IllegalArgumentException("该实例不是 SQL 类型: " + ds.getType());
        }
        try {
            SqlQueryResult result = sqlConnector.query(ds, sql, maxRows);
            int n = result.updateCount() >= 0 ? result.updateCount() : result.rowCount();
            record(datasourceId, "SQL", sql, "OK", n, result.elapsedMs(), null, snapshotSql(result));
            return result;
        } catch (Exception e) {
            String msg = rootMessage(e);
            record(datasourceId, "SQL", sql, "ERROR", null, null, msg, null);
            throw new IllegalArgumentException(msg);
        }
    }

    public RedisExecResult redisExec(String datasourceId, String command) {
        OpsDatasource ds = datasources.findRequired(datasourceId);
        if (ds.getType() != DatasourceType.REDIS) {
            throw new IllegalArgumentException("该实例不是 Redis 类型: " + ds.getType());
        }
        try {
            RedisExecResult result = redisConnector.exec(ds, command);
            record(datasourceId, "REDIS", command, "OK", null, result.elapsedMs(), null, snapshotRedis(result));
            return result;
        } catch (Exception e) {
            String msg = rootMessage(e);
            record(datasourceId, "REDIS", command, "ERROR", null, null, msg, null);
            throw new IllegalArgumentException(msg);
        }
    }

    public List<QueryHistory> history(String datasourceId, int limit) {
        datasources.findRequired(datasourceId);
        return histories.findByDatasource(datasourceId, limit <= 0 ? 50 : Math.min(limit, 500));
    }

    /** 历史详情：带上当次执行的结果快照（result=null 表示 DML/出错/超限未存）。 */
    public HistoryDetailView historyDetail(String historyId) {
        QueryHistory h = histories.findById(historyId)
                .orElseThrow(() -> new IllegalArgumentException("history not found: " + historyId));
        Object result = null;
        if (h.getResultJson() != null) {
            try {
                result = mapper.readValue(h.getResultJson(), Object.class);
            } catch (Exception ignored) {
                // 反序列化失败当无结果处理，不影响其余字段展示
            }
        }
        return new HistoryDetailView(h.getId(), h.getDatasourceId(), h.getKind(), h.getContent(), h.getStatus(),
                h.getRowCount(), h.getElapsedMs(), h.getErrorMsg(), result, h.getExecutedAt());
    }

    private void record(String dsId, String kind, String content, String status,
                        Integer rowCount, Long elapsedMs, String errorMsg, String resultJson) {
        histories.insert(QueryHistory.builder()
                .id(UUID.randomUUID().toString())
                .datasourceId(dsId)
                .kind(kind)
                .content(content)
                .status(status)
                .rowCount(rowCount)
                .elapsedMs(elapsedMs)
                .errorMsg(errorMsg)
                .resultJson(resultJson)
                .executedAt(System.currentTimeMillis())
                .build());
    }

    /** SELECT 才有结果集（updateCount<0）；DML/无数据行不存快照。行数超限则截断存、并标记 truncated。 */
    private String snapshotSql(SqlQueryResult result) {
        if (result.updateCount() >= 0 || result.rows().isEmpty()) return null;
        boolean cappedFurther = result.rows().size() > SNAPSHOT_MAX_ROWS;
        List<List<String>> rows = cappedFurther ? result.rows().subList(0, SNAPSHOT_MAX_ROWS) : result.rows();
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("columns", result.columns());
        snapshot.put("rows", rows);
        snapshot.put("rowCount", result.rowCount());
        snapshot.put("truncated", result.truncated() || cappedFurther);
        return toJsonWithinLimit(snapshot);
    }

    private String snapshotRedis(RedisExecResult result) {
        if (result.result() == null) return null;
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("command", result.command());
        snapshot.put("result", result.result());
        return toJsonWithinLimit(snapshot);
    }

    private String toJsonWithinLimit(Object value) {
        try {
            String json = mapper.writeValueAsString(value);
            return json.getBytes(StandardCharsets.UTF_8).length <= SNAPSHOT_MAX_BYTES ? json : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static String rootMessage(Throwable e) {
        Throwable cur = e;
        while (cur.getCause() != null && cur.getCause() != cur) cur = cur.getCause();
        String msg = cur.getMessage();
        return msg == null || msg.isBlank() ? cur.getClass().getSimpleName() : msg;
    }
}
