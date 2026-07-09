package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.api.dto.RedisExecResult;
import com.exceptioncoder.toolbox.ops.api.dto.SqlQueryResult;
import com.exceptioncoder.toolbox.ops.api.dto.TestResult;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import com.exceptioncoder.toolbox.ops.domain.QueryHistory;
import com.exceptioncoder.toolbox.ops.repository.QueryHistoryRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/** 查询编排：按中间件类型分派到对应连接器，并记录查询历史。 */
@Service
public class OpsQueryService {

    private final OpsDatasourceService datasources;
    private final QueryHistoryRepository histories;
    private final SqlConnector sqlConnector;
    private final RedisConnector redisConnector;

    public OpsQueryService(OpsDatasourceService datasources, QueryHistoryRepository histories,
                           SqlConnector sqlConnector, RedisConnector redisConnector) {
        this.datasources = datasources;
        this.histories = histories;
        this.sqlConnector = sqlConnector;
        this.redisConnector = redisConnector;
    }

    public TestResult test(String datasourceId) {
        OpsDatasource ds = datasources.findRequired(datasourceId);
        return switch (ds.getType().category()) {
            case SQL -> sqlConnector.test(ds);
            case REDIS -> redisConnector.test(ds);
            case MQ -> new TestResult(false, "MQ 连接测试暂未实现", 0);
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
            record(datasourceId, "SQL", sql, "OK", n, result.elapsedMs(), null);
            return result;
        } catch (Exception e) {
            String msg = rootMessage(e);
            record(datasourceId, "SQL", sql, "ERROR", null, null, msg);
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
            record(datasourceId, "REDIS", command, "OK", null, result.elapsedMs(), null);
            return result;
        } catch (Exception e) {
            String msg = rootMessage(e);
            record(datasourceId, "REDIS", command, "ERROR", null, null, msg);
            throw new IllegalArgumentException(msg);
        }
    }

    public List<QueryHistory> history(String datasourceId, int limit) {
        datasources.findRequired(datasourceId);
        return histories.findByDatasource(datasourceId, limit <= 0 ? 50 : Math.min(limit, 500));
    }

    private void record(String dsId, String kind, String content, String status,
                        Integer rowCount, Long elapsedMs, String errorMsg) {
        histories.insert(QueryHistory.builder()
                .id(UUID.randomUUID().toString())
                .datasourceId(dsId)
                .kind(kind)
                .content(content)
                .status(status)
                .rowCount(rowCount)
                .elapsedMs(elapsedMs)
                .errorMsg(errorMsg)
                .executedAt(System.currentTimeMillis())
                .build());
    }

    private static String rootMessage(Throwable e) {
        Throwable cur = e;
        while (cur.getCause() != null && cur.getCause() != cur) cur = cur.getCause();
        String msg = cur.getMessage();
        return msg == null || msg.isBlank() ? cur.getClass().getSimpleName() : msg;
    }
}
