package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.api.dto.SqlQueryResult;
import com.exceptioncoder.toolbox.ops.api.dto.TestResult;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

/**
 * MySQL / Oracle 直连查询。按需短连接：每次请求开一个连接、执行、关闭，不维护连接池。
 * 由 {@code query timeout} + {@code maxRows} 双重兜底，避免拉爆内存或卡死。
 */
@Component
public class SqlConnector {

    private static final Logger log = LoggerFactory.getLogger(SqlConnector.class);

    private static final int DEFAULT_MAX_ROWS = 1000;
    private static final int HARD_MAX_ROWS = 10_000;
    private static final int LOGIN_TIMEOUT_SEC = 8;
    private static final int QUERY_TIMEOUT_SEC = 30;

    static {
        // fat jar 下 ServiceLoader 一般能自动注册；显式加载兜底，避免 "No suitable driver"。
        loadDriver("com.mysql.cj.jdbc.Driver");
        loadDriver("oracle.jdbc.OracleDriver");
    }

    private static void loadDriver(String className) {
        try {
            Class.forName(className);
        } catch (ClassNotFoundException e) {
            log.warn("JDBC 驱动未找到（该类型将不可用）: {}", className);
        }
    }

    public TestResult test(OpsDatasource ds) {
        long start = System.currentTimeMillis();
        try (Connection conn = open(ds)) {
            String product = conn.getMetaData().getDatabaseProductName()
                    + " " + conn.getMetaData().getDatabaseProductVersion();
            return new TestResult(true, product, System.currentTimeMillis() - start);
        } catch (Exception e) {
            return new TestResult(false, rootMessage(e), System.currentTimeMillis() - start);
        }
    }

    public SqlQueryResult query(OpsDatasource ds, String sql, Integer maxRowsReq) throws SQLException {
        int maxRows = maxRowsReq == null || maxRowsReq <= 0
                ? DEFAULT_MAX_ROWS
                : Math.min(maxRowsReq, HARD_MAX_ROWS);
        long start = System.currentTimeMillis();
        try (Connection conn = open(ds);
             Statement stmt = conn.createStatement()) {
            stmt.setQueryTimeout(QUERY_TIMEOUT_SEC);
            // 多取 1 行以判断是否被截断
            stmt.setMaxRows(maxRows + 1);
            boolean hasResultSet = stmt.execute(sql);
            if (!hasResultSet) {
                int updateCount = stmt.getUpdateCount();
                return new SqlQueryResult(List.of(), List.of(), 0, Math.max(updateCount, 0),
                        false, System.currentTimeMillis() - start);
            }
            try (ResultSet rs = stmt.getResultSet()) {
                ResultSetMetaData meta = rs.getMetaData();
                int colCount = meta.getColumnCount();
                List<String> columns = new ArrayList<>(colCount);
                for (int c = 1; c <= colCount; c++) {
                    columns.add(meta.getColumnLabel(c));
                }
                List<List<String>> rows = new ArrayList<>();
                boolean truncated = false;
                while (rs.next()) {
                    if (rows.size() >= maxRows) {
                        truncated = true;
                        break;
                    }
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

    private Connection open(OpsDatasource ds) throws SQLException {
        DriverManager.setLoginTimeout(LOGIN_TIMEOUT_SEC);
        Properties props = new Properties();
        if (ds.getUsername() != null) props.setProperty("user", ds.getUsername());
        if (ds.getPassword() != null) props.setProperty("password", ds.getPassword());
        return DriverManager.getConnection(buildUrl(ds), props);
    }

    static String buildUrl(OpsDatasource ds) {
        String db = ds.getDbName() == null ? "" : ds.getDbName().trim();
        String params = ds.getParams() == null ? "" : ds.getParams().trim();
        if (ds.getType() == DatasourceType.ORACLE) {
            // service_name 形式：jdbc:oracle:thin:@//host:port/service
            String tail = db.isEmpty() ? "" : "/" + db;
            return "jdbc:oracle:thin:@//" + ds.getHost() + ":" + ds.getPort() + tail;
        }
        // MySQL
        StringBuilder url = new StringBuilder("jdbc:mysql://")
                .append(ds.getHost()).append(":").append(ds.getPort()).append("/");
        if (!db.isEmpty()) url.append(db);
        String defaults = "connectTimeout=8000&socketTimeout=60000";
        String query = params.isEmpty() ? defaults : defaults + "&" + params;
        url.append("?").append(query);
        return url.toString();
    }

    private static String rootMessage(Throwable e) {
        Throwable cur = e;
        while (cur.getCause() != null && cur.getCause() != cur) cur = cur.getCause();
        String msg = cur.getMessage();
        return msg == null || msg.isBlank() ? cur.getClass().getSimpleName() : msg;
    }
}
