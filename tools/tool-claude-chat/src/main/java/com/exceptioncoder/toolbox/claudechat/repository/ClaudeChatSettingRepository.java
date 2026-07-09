package com.exceptioncoder.toolbox.claudechat.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 模块级 KV 设置：name → payload(JSON 串)。单行配置（如 erp-db / erp-app 连接）统一存这里，
 * 取代早期的 {@code ~/.kai-toolbox/*.json}。
 */
@Repository
public class ClaudeChatSettingRepository {

    private final JdbcTemplate jdbc;

    public ClaudeChatSettingRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 取 payload；无则 null。 */
    public String find(String name) {
        List<String> rows = jdbc.query(
                "SELECT payload FROM claude_chat_setting WHERE name = ?",
                (rs, i) -> rs.getString("payload"), name);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 写入/覆盖 payload。 */
    public void upsert(String name, String payload) {
        jdbc.update("""
                INSERT INTO claude_chat_setting (name, payload, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
                """, name, payload, System.currentTimeMillis());
    }
}
