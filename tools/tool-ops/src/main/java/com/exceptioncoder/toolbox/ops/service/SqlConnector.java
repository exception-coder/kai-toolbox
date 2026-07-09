package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.api.dto.SqlQueryResult;
import com.exceptioncoder.toolbox.ops.api.dto.TestResult;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * MySQL / Oracle 查询：从 {@link OpsDataSourcePool} 借连接，用完归还（Druid 复用）。
 */
@Component
public class SqlConnector {

    private static final Logger log = LoggerFactory.getLogger(SqlConnector.class);

    private static final int DEFAULT_MAX_ROWS  = 1000;
    private static final int HARD_MAX_ROWS     = 10_000;

    private final OpsDataSourcePool pool;

    public SqlConnector(OpsDataSourcePool pool) {
        this.pool = pool;
    }

    public TestResult test(OpsDatasource ds) {
        long start = System.currentTimeMillis();
        try {
            pool.validateSql(ds);
            try (Connection conn = pool.borrowSql(ds)) {
                String product = conn.getMetaData().getDatabaseProductName()
                        + " " + conn.getMetaData().getDatabaseProductVersion();
                return new TestResult(true, product, System.currentTimeMillis() - start);
            }
        } catch (Exception e) {
            return new TestResult(false, rootMessage(e), System.currentTimeMillis() - start);
        }
    }

    public SqlQueryResult query(OpsDatasource ds, String sql, Integer maxRowsReq) throws SQLException {
        int maxRows = maxRowsReq == null || maxRowsReq <= 0
                ? DEFAULT_MAX_ROWS
                : Math.min(maxRowsReq, HARD_MAX_ROWS);
        // Oracle 单条语句带尾分号会报无效字符；统一剥离末尾分号与空白，不动语句内部。
        String cleaned = stripTrailingSemicolon(sql);
        long start = System.currentTimeMillis();
        try (Connection conn = pool.borrowSql(ds);
             Statement stmt = conn.createStatement()) {
            stmt.setMaxRows(maxRows + 1);
            boolean hasResultSet = stmt.execute(cleaned);
            if (!hasResultSet) {
                int updateCount = stmt.getUpdateCount();
                return new SqlQueryResult(List.of(), List.of(), 0, Math.max(updateCount, 0),
                        false, System.currentTimeMillis() - start);
            }
            try (ResultSet rs = stmt.getResultSet()) {
                ResultSetMetaData meta = rs.getMetaData();
                int colCount = meta.getColumnCount();
                List<String> columns = new ArrayList<>(colCount);
                for (int c = 1; c <= colCount; c++) columns.add(meta.getColumnLabel(c));
                List<List<String>> rows = new ArrayList<>();
                boolean truncated = false;
                while (rs.next()) {
                    if (rows.size() >= maxRows) { truncated = true; break; }
                    List<String> row = new ArrayList<>(colCount);
                    for (int c = 1; c <= colCount; c++) {
                        Object v = rs.getObject(c);
                        row.add(v == null ? null : String.valueOf(v));
                    }
                    rows.add(row);
                }
                return new SqlQueryResult(columns, rows, rows.size(), -1, truncated,
                        System.currentTimeMillis() - start);
            }
        }
    }

    /** 构建 JDBC URL（供 OpsDataSourcePool 建池时使用）。 */
    static String buildUrl(OpsDatasource ds) {
        String db     = ds.getDbName() == null ? "" : ds.getDbName().trim();
        String params = ds.getParams()  == null ? "" : ds.getParams().trim();
        if (ds.getType() == DatasourceType.ORACLE) {
            String tail = db.isEmpty() ? "" : "/" + db;
            return "jdbc:oracle:thin:@//" + ds.getHost() + ":" + ds.getPort() + tail;
        }
        StringBuilder url = new StringBuilder("jdbc:mysql://")
                .append(ds.getHost()).append(":").append(ds.getPort()).append("/");
        if (!db.isEmpty()) url.append(db);
        String defaults = "connectTimeout=8000&socketTimeout=60000";
        url.append("?").append(params.isEmpty() ? defaults : defaults + "&" + params);
        return url.toString();
    }

    static String stripTrailingSemicolon(String sql) {
        if (sql == null) return "";
        String s = sql.strip();
        while (s.endsWith(";")) s = s.substring(0, s.length() - 1).strip();
        return s;
    }

    private static String rootMessage(Throwable e) {
        Throwable cur = e;
        while (cur.getCause() != null && cur.getCause() != cur) cur = cur.getCause();
        String msg = cur.getMessage();
        return msg == null || msg.isBlank() ? cur.getClass().getSimpleName() : msg;
    }
}
