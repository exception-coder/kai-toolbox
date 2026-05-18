package com.exceptioncoder.toolbox.browserrequest.repository;

import com.exceptioncoder.toolbox.browserrequest.domain.BrowserVar;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Repository
public class BrowserVarRepository {

    private final JdbcTemplate jdbc;

    private final RowMapper<BrowserVar> ROW = (rs, i) -> BrowserVar.builder()
            .sessionId(rs.getString("session_id"))
            .name(rs.getString("name"))
            .value(rs.getString("value"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public BrowserVarRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<BrowserVar> listBySession(String sessionId) {
        return jdbc.query(
                "SELECT * FROM browser_request_var WHERE session_id = ? ORDER BY name ASC",
                ROW, sessionId);
    }

    /** 全量取出会话变量映射，供模板渲染用。 */
    public Map<String, String> asMap(String sessionId) {
        Map<String, String> m = new HashMap<>();
        for (BrowserVar v : listBySession(sessionId)) {
            m.put(v.getName(), v.getValue());
        }
        return m;
    }

    /** 插入或覆盖。SQLite 的 ON CONFLICT 等价于 UPSERT。 */
    public void upsert(String sessionId, String name, String value, long now) {
        jdbc.update("""
                INSERT INTO browser_request_var (session_id, name, value, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(session_id, name) DO UPDATE SET
                  value = excluded.value,
                  updated_at = excluded.updated_at
                """, sessionId, name, value, now);
    }

    public boolean delete(String sessionId, String name) {
        return jdbc.update("DELETE FROM browser_request_var WHERE session_id = ? AND name = ?",
                sessionId, name) > 0;
    }

    public int deleteAllForSession(String sessionId) {
        return jdbc.update("DELETE FROM browser_request_var WHERE session_id = ?", sessionId);
    }
}
