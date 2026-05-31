package com.exceptioncoder.toolbox.resume.repository;

import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * 简历 KV 仓储：操作 {@code resume_kv} 表，按 key_name 查询 / upsert。
 *
 * <p>采用 SQLite 的 {@code INSERT ... ON CONFLICT(key_name) DO UPDATE} 语法实现幂等 upsert，
 * 单条 SQL 完成「不存在则插入、存在则覆盖」，不需要先 select 再 update 的两段式。
 */
@Repository
public class ResumeKvRepository {

    private final JdbcTemplate jdbc;

    public ResumeKvRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<String> findValue(String keyName) {
        try {
            String value = jdbc.queryForObject(
                    "SELECT value_json FROM resume_kv WHERE key_name = ?",
                    String.class, keyName);
            return Optional.ofNullable(value);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    public void upsert(String keyName, String valueJson) {
        jdbc.update("""
                INSERT INTO resume_kv (key_name, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key_name) DO UPDATE SET
                  value_json = excluded.value_json,
                  updated_at = excluded.updated_at
                """,
                keyName, valueJson, System.currentTimeMillis());
    }
}
