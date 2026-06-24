package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.WelfareDemoProperties;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY;

/**
 * 演示 agent 改数据的唯一通道：在**本会话的 demo SQLite 库**执行受限 SQL，绝不连 toolbox.db。
 *
 * <p>纵深防御：物理上连接句柄由 sessionId 映射到该会话的副本库（外部不能传库路径）；逻辑上再做
 * 单语句 + 关键字黑名单 + 表名白名单（{@code welfare_sign_*}）校验。demo 库本就只含这些表。</p>
 */
@Service
public class WelfareDemoSqlService {

    /** 表引用关键字后紧跟的表名。 */
    private static final Pattern TABLE_REF =
            Pattern.compile("(?i)\\b(?:from|join|into|update|table)\\s+[\"'`\\[]?([a-zA-Z_][\\w]*)");
    /** 危险关键字黑名单。 */
    private static final Pattern FORBIDDEN =
            Pattern.compile("(?i)\\b(attach|detach|pragma|vacuum)\\b");

    private final WelfareDemoSandboxProvisioner provisioner;
    private final WelfareDemoProperties props;

    public WelfareDemoSqlService(WelfareDemoSandboxProvisioner provisioner, WelfareDemoProperties props) {
        this.provisioner = provisioner;
        this.props = props;
    }

    /** 执行一条受限 SQL，返回 {kind, ...}。库由 sessionId 绑定。 */
    public Map<String, Object> exec(String sessionId, String sql, List<Object> params) {
        Path db = provisioner.demoDbFor(sessionId);
        if (db == null) {
            throw new ResponseStatusException(NOT_FOUND, "演示会话不存在或已结束");
        }
        String trimmed = sanitizeSingle(sql);
        validateTables(trimmed);

        try (Connection conn = DriverManager.getConnection("jdbc:sqlite:" + db);
             PreparedStatement ps = conn.prepareStatement(trimmed)) {
            if (params != null) {
                for (int i = 0; i < params.size(); i++) {
                    ps.setObject(i + 1, params.get(i));
                }
            }
            if (isQuery(trimmed)) {
                try (ResultSet rs = ps.executeQuery()) {
                    return readResult(rs);
                }
            }
            int affected = ps.executeUpdate();
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("kind", "update");
            out.put("affected", affected);
            return out;
        } catch (SQLException e) {
            throw new ResponseStatusException(UNPROCESSABLE_ENTITY, "SQL 执行失败: " + e.getMessage());
        }
    }

    private String sanitizeSingle(String sql) {
        if (sql == null || sql.isBlank()) {
            throw new ResponseStatusException(UNPROCESSABLE_ENTITY, "SQL 不能为空");
        }
        String s = sql.trim();
        if (s.endsWith(";")) {
            s = s.substring(0, s.length() - 1).trim();
        }
        if (s.contains(";")) {
            throw new ResponseStatusException(UNPROCESSABLE_ENTITY, "禁止多语句 SQL");
        }
        if (FORBIDDEN.matcher(s).find()) {
            throw new ResponseStatusException(UNPROCESSABLE_ENTITY, "禁止 ATTACH/DETACH/PRAGMA/VACUUM");
        }
        return s;
    }

    private void validateTables(String sql) {
        String prefix = props.getAllowedTablePrefix().toLowerCase(Locale.ROOT);
        Matcher m = TABLE_REF.matcher(sql);
        while (m.find()) {
            String table = m.group(1).toLowerCase(Locale.ROOT);
            if (!table.startsWith(prefix)) {
                throw new ResponseStatusException(UNPROCESSABLE_ENTITY, "SQL 触碰了非福利签收表: " + m.group(1));
            }
        }
    }

    private static boolean isQuery(String sql) {
        String head = sql.stripLeading().toLowerCase(Locale.ROOT);
        return head.startsWith("select") || head.startsWith("with");
    }

    private static Map<String, Object> readResult(ResultSet rs) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        int n = md.getColumnCount();
        List<String> columns = new ArrayList<>(n);
        for (int i = 1; i <= n; i++) {
            columns.add(md.getColumnLabel(i));
        }
        List<List<Object>> rows = new ArrayList<>();
        while (rs.next()) {
            List<Object> row = new ArrayList<>(n);
            for (int i = 1; i <= n; i++) {
                row.add(rs.getObject(i));
            }
            rows.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "query");
        out.put("columns", columns);
        out.put("rows", rows);
        out.put("rowCount", rows.size());
        return out;
    }
}
