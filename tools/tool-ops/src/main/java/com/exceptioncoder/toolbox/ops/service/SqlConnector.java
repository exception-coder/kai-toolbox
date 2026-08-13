package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.api.dto.SqlCheckResult;
import com.exceptioncoder.toolbox.ops.api.dto.SqlQueryResult;
import com.exceptioncoder.toolbox.ops.api.dto.TestResult;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * MySQL / Oracle 查询：从 {@link OpsDataSourcePool} 借连接，用完归还（Druid 复用）。
 */
@Component
public class SqlConnector {

    private static final Logger log = LoggerFactory.getLogger(SqlConnector.class);

    private static final int DEFAULT_MAX_ROWS  = 1000;
    private static final int HARD_MAX_ROWS     = 10_000;
    private static final int READ_ONLY_QUERY_TIMEOUT_SECONDS = 60;
    private static final int SQL_CHECK_TIMEOUT_SECONDS = 30;
    private static final int ORACLE_VARCHAR_CHECK_LIMIT = 30_000;

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
        return execute(ds, stripTrailingSemicolon(sql), maxRowsReq, false);
    }

    public SqlQueryResult queryReadOnly(OpsDatasource ds, String sql, Integer maxRowsReq) throws SQLException {
        return execute(ds, sql, maxRowsReq, true);
    }

    /**
     * 在目标环境只解析、不执行待检查 SQL。MySQL 使用服务端 PREPARE；Oracle 对 DML/查询使用
     * DBMS_SQL.PARSE。Oracle 解析 DDL 会直接执行并隐式提交，因此明确返回不支持，绝不冒险校验。
     */
    public SqlCheckResult check(OpsDatasource ds, String sql) {
        long start = System.currentTimeMillis();
        SqlStatementPolicy.Analysis analysis;
        try {
            analysis = SqlStatementPolicy.analyze(sql);
        } catch (IllegalArgumentException e) {
            return checkResult(SqlCheckResult.Status.INVALID, null, e.getMessage(), start);
        }

        if (ds.getType() == DatasourceType.ORACLE
                && analysis.statementType() == SqlStatementPolicy.StatementType.DDL) {
            return checkResult(SqlCheckResult.Status.UNSUPPORTED, analysis,
                    "Oracle 的 DDL 在服务端解析阶段就会执行并隐式提交，安全检查不会尝试解析；请先在隔离环境验证后再执行",
                    start);
        }
        if (ds.getType() == DatasourceType.ORACLE
                && analysis.normalizedSql().length() > ORACLE_VARCHAR_CHECK_LIMIT) {
            return checkResult(SqlCheckResult.Status.UNSUPPORTED, analysis,
                    "当前 Oracle 安全检查最多支持 30000 个字符", start);
        }

        try (Connection conn = pool.borrowSql(ds)) {
            if (ds.getType() == DatasourceType.MYSQL) {
                checkMySql(conn, analysis.normalizedSql());
            } else if (ds.getType() == DatasourceType.ORACLE) {
                checkOracle(conn, analysis.normalizedSql());
            } else {
                return checkResult(SqlCheckResult.Status.UNSUPPORTED, analysis,
                        "该数据库类型暂不支持 SQL 检查", start);
            }
            return checkResult(SqlCheckResult.Status.VALID, analysis,
                    "目标环境解析通过，当前对象与权限可用于该 SQL", start);
        } catch (SQLException e) {
            SqlCheckResult.Status status = isConnectionError(e)
                    ? SqlCheckResult.Status.ERROR
                    : isUnsupportedPrepare(e)
                    ? SqlCheckResult.Status.UNSUPPORTED
                    : SqlCheckResult.Status.INVALID;
            return checkResult(status, analysis, rootMessage(e), start);
        } catch (RuntimeException e) {
            return checkResult(SqlCheckResult.Status.ERROR, analysis, rootMessage(e), start);
        }
    }

    private void checkMySql(Connection conn, String sql) throws SQLException {
        String suffix = UUID.randomUUID().toString().replace("-", "");
        String variableName = "@toolbox_sql_check_" + suffix;
        String statementName = "toolbox_sql_check_" + suffix;
        boolean prepared = false;
        try {
            try (PreparedStatement bind = conn.prepareStatement("SET " + variableName + " = ?")) {
                bind.setString(1, sql);
                bind.executeUpdate();
            }
            try (Statement statement = conn.createStatement()) {
                statement.setQueryTimeout(SQL_CHECK_TIMEOUT_SECONDS);
                statement.execute("PREPARE " + statementName + " FROM " + variableName);
                prepared = true;
            }
        } finally {
            try (Statement cleanup = conn.createStatement()) {
                if (prepared) cleanup.execute("DEALLOCATE PREPARE " + statementName);
                cleanup.execute("SET " + variableName + " = NULL");
            } catch (SQLException cleanupError) {
                log.debug("[ops-sql-check] MySQL cleanup failed: {}", cleanupError.getMessage());
            }
        }
    }

    private void checkOracle(Connection conn, String sql) throws SQLException {
        String block = """
                DECLARE
                  check_cursor INTEGER;
                BEGIN
                  check_cursor := DBMS_SQL.OPEN_CURSOR;
                  BEGIN
                    DBMS_SQL.PARSE(check_cursor, ?, DBMS_SQL.NATIVE);
                    DBMS_SQL.CLOSE_CURSOR(check_cursor);
                  EXCEPTION
                    WHEN OTHERS THEN
                      IF DBMS_SQL.IS_OPEN(check_cursor) THEN
                        DBMS_SQL.CLOSE_CURSOR(check_cursor);
                      END IF;
                      RAISE;
                  END;
                END;
                """;
        try (CallableStatement statement = conn.prepareCall(block)) {
            statement.setString(1, sql);
            statement.setQueryTimeout(SQL_CHECK_TIMEOUT_SECONDS);
            statement.execute();
        }
    }

    private SqlQueryResult execute(OpsDatasource ds, String sql, Integer maxRowsReq, boolean readOnly)
            throws SQLException {
        int maxRows = maxRowsReq == null || maxRowsReq <= 0
                ? DEFAULT_MAX_ROWS
                : Math.min(maxRowsReq, HARD_MAX_ROWS);
        long start = System.currentTimeMillis();
        try (Connection conn = pool.borrowSql(ds)) {
            if (readOnly) {
                conn.setReadOnly(true);
            }
            try (Statement stmt = conn.createStatement()) {
                stmt.setMaxRows(maxRows + 1);
                if (readOnly) {
                    stmt.setQueryTimeout(READ_ONLY_QUERY_TIMEOUT_SECONDS);
                }
                boolean hasResultSet = stmt.execute(sql);
                if (!hasResultSet) {
                    if (readOnly) {
                        throw new SQLException("只读查询未返回结果集");
                    }
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

    private static SqlCheckResult checkResult(SqlCheckResult.Status status,
                                              SqlStatementPolicy.Analysis analysis,
                                              String message,
                                              long start) {
        return new SqlCheckResult(status,
                analysis == null ? "UNKNOWN" : analysis.statementType().name(),
                message,
                System.currentTimeMillis() - start);
    }

    private static boolean isConnectionError(SQLException error) {
        String sqlState = error.getSQLState();
        return sqlState != null && sqlState.startsWith("08");
    }

    private static boolean isUnsupportedPrepare(SQLException error) {
        String message = rootMessage(error).toLowerCase(Locale.ROOT);
        return message.contains("not supported in the prepared statement protocol")
                || message.contains("not supported in prepared statements");
    }
}
