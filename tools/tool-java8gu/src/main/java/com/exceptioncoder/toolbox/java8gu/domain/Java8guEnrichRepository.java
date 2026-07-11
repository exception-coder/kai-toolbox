package com.exceptioncoder.toolbox.java8gu.domain;

import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

/**
 * Java 八股 AI 补全结果的 SQLite 缓存 DAO，复用 toolbox-common 注册的全局 JdbcTemplate。
 * 表结构见 resources/db/java8gu-schema.sql。缓存键 = (题号, 内容哈希)，内容变则自然 miss 重算。
 */
@Repository
public class Java8guEnrichRepository {

    private final JdbcTemplate jdbc;

    public Java8guEnrichRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 一行缓存补全：payload + 对应内容哈希。 */
    public record CachedEnrich(String payload, String hash) {
    }

    /** 按 (id, hash) 取缓存的补全 JSON；无则空。 */
    public Optional<String> find(String id, String hash) {
        try {
            String payload = jdbc.queryForObject(
                    "SELECT payload FROM tool_java8gu_enrich WHERE id = ? AND hash = ?",
                    String.class, id, hash);
            return Optional.ofNullable(payload);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    /**
     * 取某题最近一次补全（不限 hash，按 created_at 倒序）。
     * 用于内容已变、当前 hash 未命中时，回退加载「最近一次」补全（created_at 为 ISO-8601 UTC，字典序即时间序）。
     */
    public Optional<CachedEnrich> findLatest(String id) {
        try {
            CachedEnrich row = jdbc.queryForObject(
                    "SELECT payload, hash FROM tool_java8gu_enrich WHERE id = ? ORDER BY created_at DESC LIMIT 1",
                    (rs, n) -> new CachedEnrich(rs.getString("payload"), rs.getString("hash")), id);
            return Optional.ofNullable(row);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    /** upsert 补全结果（同 id+hash 覆盖）。 */
    public void save(String id, String hash, String payload, String model) {
        jdbc.update("""
                INSERT INTO tool_java8gu_enrich (id, hash, payload, model, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id, hash) DO UPDATE SET
                  payload = excluded.payload,
                  model = excluded.model,
                  created_at = excluded.created_at
                """, id, hash, payload, model, Instant.now().toString());
    }
}
