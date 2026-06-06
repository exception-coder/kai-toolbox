package com.exceptioncoder.toolbox.common.dynamicconfig.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * dynamic_config_override 覆盖层读写。扁平 key→字符串值。
 */
@Repository
public class DynamicConfigOverrideRepository {

    private final JdbcTemplate jdbc;

    public DynamicConfigOverrideRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, String> findAll() {
        Map<String, String> map = new LinkedHashMap<>();
        jdbc.query("SELECT config_key, value FROM dynamic_config_override",
                rs -> { map.put(rs.getString("config_key"), rs.getString("value")); });
        return map;
    }

    public void upsert(String key, String value, long updatedAt) {
        jdbc.update("""
                INSERT INTO dynamic_config_override (config_key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(config_key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at
                """, key, value, updatedAt);
    }

    /**
     * 删除某配置块前缀下的全部覆盖。匹配 {@code prefix} 自身、{@code prefix.xxx}、{@code prefix[idx]}，
     * 避免误删共享前缀字符串的其它块（如 toolbox.a 不会误删 toolbox.ab）。
     */
    public void deleteByPrefix(String prefix) {
        jdbc.update("""
                DELETE FROM dynamic_config_override
                WHERE config_key = ? OR config_key LIKE ? OR config_key LIKE ?
                """, prefix, prefix + ".%", prefix + "[%");
    }
}
