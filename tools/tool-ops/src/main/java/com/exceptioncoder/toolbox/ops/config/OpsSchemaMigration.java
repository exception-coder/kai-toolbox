package com.exceptioncoder.toolbox.ops.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 轻量幂等迁移：给既有库的 ops_query_history 补 result_json 列。
 *
 * <p>SchemaInitializer 的朴素分号切分每次启动都跑且要求 DDL 幂等（IF NOT EXISTS），
 * 而 {@code ALTER TABLE ... ADD COLUMN} 非幂等（重复执行报 duplicate column），不能放进 schema.sql。
 * 故在此用 try/catch 兜底：新装库（schema.sql 已含该列）会命中「duplicate column」被忽略，
 * 旧库则补列成功。{@link ApplicationReadyEvent} 保证此时表已由 SchemaInitializer 建好。
 */
@Component
public class OpsSchemaMigration {

    private static final Logger log = LoggerFactory.getLogger(OpsSchemaMigration.class);

    private final JdbcTemplate jdbc;

    public OpsSchemaMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void addResultJsonColumn() {
        try {
            jdbc.execute("ALTER TABLE ops_query_history ADD COLUMN result_json TEXT");
            log.info("[ops] 迁移：ops_query_history 已补 result_json 列");
        } catch (Exception e) {
            log.debug("[ops] result_json 列迁移跳过：{}", e.getMessage());
        }
    }
}
