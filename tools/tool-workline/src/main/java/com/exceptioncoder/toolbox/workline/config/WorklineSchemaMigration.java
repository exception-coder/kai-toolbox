package com.exceptioncoder.toolbox.workline.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 工作线模块的一次性 schema 迁移（v2）。
 *
 * <p>v2 给 {@code workline_entry} 增加自引用列 {@code parent_id}。SQLite 不支持
 * {@code ADD COLUMN IF NOT EXISTS}，而 {@code SchemaInitializer} 每次启动重跑
 * {@code *-schema.sql}，无法把非幂等的 {@code ALTER} 放进 schema.sql。
 *
 * <p>故在此用 {@link CommandLineRunner}（晚于 schema 初始化执行）做幂等迁移：
 * <ul>
 *   <li>存量库：{@code ALTER} 成功补列；随后建 parent 索引。</li>
 *   <li>全新库：列已由 CREATE TABLE 带出，{@code ALTER} 抛「duplicate column」被吞掉；索引 IF NOT EXISTS 幂等。</li>
 * </ul>
 */
@Component
public class WorklineSchemaMigration implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(WorklineSchemaMigration.class);

    private final JdbcTemplate jdbc;

    public WorklineSchemaMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        try {
            jdbc.execute("ALTER TABLE workline_entry ADD COLUMN parent_id INTEGER");
            log.info("workline: 已为 workline_entry 补充 parent_id 列");
        } catch (DataAccessException e) {
            // 列已存在（全新库由 CREATE TABLE 带出，或本迁移此前已执行）——幂等忽略
            log.debug("workline: parent_id 列已存在，跳过 ALTER ({})", e.getMessage());
        }
        // 列就绪后再建索引（IF NOT EXISTS 幂等）
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_workline_entry_parent ON workline_entry(parent_id)");
    }
}
