package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ErpDbQueryResult;
import com.exceptioncoder.toolbox.claudechat.service.SrmDbConfigService.SrmDbConn;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * SRM 测试库（MySQL）只读查询执行器：供 agent 经 sidecar 的 srm_db MCP 回灌 SQL 做逻辑核对。
 *
 * <p>三重安全：① 建议配只读账号；② 连接 {@code setReadOnly(true)}；③ SELECT-only 语法闸
 * （仅 SELECT/WITH 开头、单语句、拦截 DML/DDL 关键字）。另有行数 + 超时上限，防拖库。
 * 与 {@link ErpDbService} 唯一不同是 JDBC URL 走 MySQL、连通性探测用 {@code SELECT 1}；
 * 查询结果复用 {@link ErpDbQueryResult}（通用 DTO，非 ERP 专属）。</p>
 */
@Slf4j
@Service
public class SrmDbService {

    private static final int MAX_ROWS = 200;
    private static final int TIMEOUT_SEC = 15;
    /** 兜底拦截的写/DDL/过程关键字（词边界匹配；只读账号是主闸，这里是第二道）。 */
    private static final Pattern DANGER = Pattern.compile(
            "(?i)\\b(insert|update|delete|merge|drop|create|alter|truncate|grant|revoke|call|execute|exec|begin|declare)\\b");

    private final SrmDbConfigService config;

    public SrmDbService(SrmDbConfigService config) {
        this.config = config;
    }

    /** 仅允许只读语句：SELECT/WITH 开头、单语句、不含写/DDL 关键字。 */
    static boolean isReadOnly(String sql) {
        if (sql == null) {
            return false;
        }
        String s = sql.strip();
        while (s.endsWith(";")) {
            s = s.substring(0, s.length() - 1).strip();
        }
        if (s.isEmpty()) {
            return false;
        }
        String lower = s.toLowerCase();
        if (!(lower.startsWith("select") || lower.startsWith("with"))) {
            return false;
        }
        if (s.contains(";")) {
            return false; // 多语句
        }
        return !DANGER.matcher(s).find();
    }

    private static String jdbcUrl(SrmDbConn c) {
        // MySQL：禁用 SSL、UTC 时区，只读核对够用；useCursorFetch 交给驱动默认。
        return "jdbc:mysql://" + c.host() + ":" + c.port() + "/" + c.database()
                + "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC&connectTimeout=8000&socketTimeout=20000";
    }

    /** 测试连通性：SELECT 1。返回 null=成功，否则为错误信息。 */
    public String test() {
        SrmDbConn c = config.get();
        if (c == null || !c.isComplete()) {
            return "未配置或配置不完整";
        }
        try (Connection conn = DriverManager.getConnection(jdbcUrl(c), c.user(), c.password())) {
            conn.setReadOnly(true);
            try (PreparedStatement ps = conn.prepareStatement("SELECT 1");
                 ResultSet rs = ps.executeQuery()) {
                rs.next();
                return null;
            }
        } catch (SQLException e) {
            return e.getMessage();
        }
    }

    /** 执行只读查询。任何失败都以 result.error 返回，不抛（供 MCP 回灌文本）。 */
    public ErpDbQueryResult query(String sql, List<Object> params) {
        SrmDbConn c = config.get();
        if (c == null || !c.isComplete()) {
            return ErpDbQueryResult.err("未配置 SRM 测试库连接（请在「SRM需求开发」里填连接信息）");
        }
        if (!isReadOnly(sql)) {
            return ErpDbQueryResult.err("仅允许只读查询：SELECT/WITH 开头、单语句、不含写/DDL 关键字");
        }
        try (Connection conn = DriverManager.getConnection(jdbcUrl(c), c.user(), c.password())) {
            conn.setReadOnly(true);
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setQueryTimeout(TIMEOUT_SEC);
                ps.setMaxRows(MAX_ROWS + 1); // 多取 1 行探测截断
                if (params != null) {
                    for (int i = 0; i < params.size(); i++) {
                        ps.setObject(i + 1, params.get(i));
                    }
                }
                try (ResultSet rs = ps.executeQuery()) {
                    ResultSetMetaData md = rs.getMetaData();
                    int cols = md.getColumnCount();
                    List<String> columns = new ArrayList<>(cols);
                    for (int i = 1; i <= cols; i++) {
                        columns.add(md.getColumnLabel(i));
                    }
                    List<List<String>> rows = new ArrayList<>();
                    boolean truncated = false;
                    while (rs.next()) {
                        if (rows.size() >= MAX_ROWS) {
                            truncated = true;
                            break;
                        }
                        List<String> row = new ArrayList<>(cols);
                        for (int i = 1; i <= cols; i++) {
                            row.add(rs.getString(i)); // 统一转字符串，JSON 安全、够核对
                        }
                        rows.add(row);
                    }
                    return new ErpDbQueryResult(columns, rows, rows.size(), truncated, null);
                }
            }
        } catch (SQLException e) {
            return ErpDbQueryResult.err("查询失败：" + e.getMessage());
        }
    }
}
