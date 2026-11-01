package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.api.dto.HistoryDetailView;
import com.exceptioncoder.toolbox.ops.api.dto.RedisExecResult;
import com.exceptioncoder.toolbox.ops.api.dto.RedisKeyDeleteResult;
import com.exceptioncoder.toolbox.ops.api.dto.SqlCheckResult;
import com.exceptioncoder.toolbox.ops.api.dto.SqlQueryResult;
import com.exceptioncoder.toolbox.ops.api.dto.TestResult;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import com.exceptioncoder.toolbox.ops.domain.QueryHistory;
import com.exceptioncoder.toolbox.ops.repository.QueryHistoryRepository;
import com.exceptioncoder.toolbox.common.resource.ResourceEnvironmentPolicy;
import com.exceptioncoder.toolbox.common.resource.SqlWriteAuthorization;
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

    static final String WRITE_CONFIRMATION_REQUIRED = "WRITE_CONFIRMATION_REQUIRED:";

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

    public SqlQueryResult sqlQuery(String datasourceId, String sql, Integer maxRows, boolean confirmedWrite) {
        OpsDatasource ds = datasources.findRequired(datasourceId);
        if (ds.getType().category() != DatasourceType.Category.SQL) {
            throw new IllegalArgumentException("该实例不是 SQL 类型: " + ds.getType());
        }
        String normalized = SqlStatementPolicy.analyze(sql).normalizedSql();
        boolean readOnly = ReadOnlySqlPolicy.isReadOnly(normalized);
        if (!readOnly && !confirmedWrite) {
            throw new IllegalArgumentException(WRITE_CONFIRMATION_REQUIRED + "该 SQL 可能修改数据或数据库结构，需要确认后执行");
        }
        try {
            SqlQueryResult result = readOnly
                    ? sqlConnector.queryReadOnly(ds, normalized, maxRows)
                    : sqlConnector.query(ds, normalized, maxRows);
            int n = result.updateCount() >= 0 ? result.updateCount() : result.rowCount();
            record(datasourceId, "SQL", normalized, "OK", n, result.elapsedMs(), null, snapshotSql(result));
            return result;
        } catch (Exception e) {
            String msg = rootMessage(e);
            record(datasourceId, "SQL", normalized, "ERROR", null, null, msg, null);
            throw new IllegalArgumentException(msg);
        }
    }

    public SqlQueryResult readOnlySqlQuery(String datasourceId, String sql, Integer maxRows) {
        OpsDatasource ds = datasources.findRequired(datasourceId);
        com.exceptioncoder.toolbox.common.resource.ResourceEnvironmentPolicy.requireAllowed(ds.getEnv());
        if (ds.getType().category() != DatasourceType.Category.SQL) {
            throw new IllegalArgumentException("该实例不是 SQL 类型: " + ds.getType());
        }
        String normalized = ReadOnlySqlPolicy.validateAndNormalize(sql);
        try {
            SqlQueryResult result = sqlConnector.queryReadOnly(ds, normalized, maxRows);
            record(datasourceId, "SQL", normalized, "OK", result.rowCount(), result.elapsedMs(), null,
                    snapshotSql(result));
            return result;
        } catch (Exception e) {
            String msg = rootMessage(e);
            record(datasourceId, "SQL", normalized, "ERROR", null, null, msg, null);
            throw new IllegalArgumentException(msg);
        }
    }

    /** 普通开发的逐次授权写通道；QUERY 与人工控制台的原有契约保持不变。 */
    public SqlWriteExecution authorizedSqlWrite(String datasourceId, String sql, SqlWriteAuthorization authorization) {
        if (authorization == null) {
            throw new IllegalArgumentException("WRITE_AUTHORIZATION_REQUIRED: SQL 写入需要本次用户明确授权及适用范围");
        }
        authorization.validate();
        OpsDatasource ds = datasources.findRequired(datasourceId);
        ResourceEnvironmentPolicy.requireAllowed(ds.getEnv());
        if (ds.getType().category() != DatasourceType.Category.SQL) {
            throw new IllegalArgumentException("该实例不是 SQL 类型: " + ds.getType());
        }
        var analysis = SqlStatementPolicy.analyze(sql);
        if (analysis.statementType() != SqlStatementPolicy.StatementType.DDL
                && analysis.statementType() != SqlStatementPolicy.StatementType.DML) {
            throw new IllegalArgumentException("EXECUTE 仅接受单条 DDL/DML；只读查询请使用 QUERY");
        }
        String normalized = analysis.normalizedSql();
        String id = "forge-sql-write:" + authorization.requestId().toLowerCase(java.util.Locale.ROOT);
        String content = "-- Forge SQL EXECUTE 授权声明（Agent 提供，非独立人审凭证）："
                + serializeWriteRecord(authorization) + "\n" + normalized;
        if (!histories.claimSqlWrite(id, datasourceId, content)) {
            return existingSqlWrite(id, datasourceId, content);
        }
        SqlQueryResult result;
        try {
            result = sqlConnector.query(ds, normalized, SNAPSHOT_MAX_ROWS);
        } catch (Exception exception) {
            // 驱动异常也可能发生在提交之后，不能由异常推断远端未执行。
            String message = rootMessage(exception);
            histories.finishSqlWrite(id, "UNKNOWN", null, null, message, null);
            throw new IllegalArgumentException("SQL_WRITE_RESULT_UNKNOWN: 请求 " + authorization.requestId()
                    + " 的实际结果需核对，禁止自动重放。" + message, exception);
        }
        var execution = new SqlWriteExecution(authorization.requestId(), "OK", result, "已执行；重复请求复用本记录");
        try {
            histories.finishSqlWrite(id, "OK", result.updateCount() >= 0 ? result.updateCount() : result.rowCount(),
                    result.elapsedMs(), null, serializeWriteRecord(result));
        } catch (RuntimeException exception) {
            throw new IllegalStateException("SQL_WRITE_RESULT_UNKNOWN: 数据库已返回结果，但本地记录未确认；请核对请求 "
                    + authorization.requestId() + "，禁止自动重放", exception);
        }
        return execution;
    }

    private SqlWriteExecution existingSqlWrite(String id, String datasourceId, String content) {
        QueryHistory history = histories.findById(id)
                .orElseThrow(() -> new IllegalStateException("SQL 写入已认领但记录不可读；禁止自动重放"));
        if (!datasourceId.equals(history.getDatasourceId()) || !content.equals(history.getContent())) {
            throw new IllegalArgumentException("SQL_WRITE_REQUEST_MISMATCH: 请求 ID 已被不同 SQL、目标或授权声明使用");
        }
        if ("OK".equals(history.getStatus()) && history.getResultJson() != null) {
            try {
                return new SqlWriteExecution(id.substring("forge-sql-write:".length()), "OK",
                        mapper.readValue(history.getResultJson(), SqlQueryResult.class), "已执行；复用原记录，未重复执行");
            } catch (Exception exception) {
                throw new IllegalStateException("SQL 写入已执行但结果记录不可读；禁止自动重放", exception);
            }
        }
        throw new IllegalStateException("SQL_WRITE_RESULT_UNKNOWN: 请求仍在执行或结果不明，请核对历史及实际数据；禁止自动重放");
    }

    private String serializeWriteRecord(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("无法保存 SQL 写入记录", exception);
        }
    }

    public record SqlWriteExecution(String requestId, String status, SqlQueryResult result, String message) { }

    public SqlCheckResult checkSql(String datasourceId, String sql) {
        OpsDatasource ds = datasources.findRequired(datasourceId);
        if (ds.getType().category() != DatasourceType.Category.SQL) {
            throw new IllegalArgumentException("该实例不是 SQL 类型: " + ds.getType());
        }
        return sqlConnector.check(ds, sql);
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

    /** 按受限前缀模式批量删除 Redis 键，并写入既有操作历史。 */
    public RedisKeyDeleteResult deleteRedisKeysByPatterns(String datasourceId, List<String> patterns) {
        OpsDatasource ds = datasources.findRequired(datasourceId);
        if (ds.getType() != DatasourceType.REDIS) {
            throw new IllegalArgumentException("该实例不是 Redis 类型: " + ds.getType());
        }
        List<String> normalized = RedisKeyPatternPolicy.normalize(patterns);
        String content = "DELETE KEYS BY PATTERNS " + String.join(", ", normalized);
        try {
            RedisKeyDeleteResult result = redisConnector.deleteByPatterns(ds, normalized);
            int rowCount = result.totalDeleted() > Integer.MAX_VALUE
                    ? Integer.MAX_VALUE : (int) result.totalDeleted();
            record(datasourceId, "REDIS", content, "OK", rowCount, result.elapsedMs(), null,
                    toJsonWithinLimit(result));
            return result;
        } catch (Exception e) {
            String msg = rootMessage(e);
            record(datasourceId, "REDIS", content, "ERROR", null, null, msg, null);
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
