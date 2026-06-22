package com.exceptioncoder.toolbox.visitoranalysis.repository;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 无法用 {@code CREATE TABLE IF NOT EXISTS} 表达的一次性迁移：给老库的 va_customer_ref 追加 synced_at 列
 * （是否已同步进向量库的标记）。新部署由 schema.sql 直接建好，这里只为存量库补列，按 pragma 检查保证幂等。
 */
@Component
@DependsOn("schemaInitializer")
public class CustomerRefMigration {

    private static final Logger log = LoggerFactory.getLogger(CustomerRefMigration.class);

    private final JdbcTemplate jdbc;

    public CustomerRefMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostConstruct
    public void migrate() {
        Integer present = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pragma_table_info('va_customer_ref') WHERE name = 'synced_at'",
                Integer.class);
        if (present == null || present == 0) {
            jdbc.execute("ALTER TABLE va_customer_ref ADD COLUMN synced_at INTEGER");
            log.info("[visitor-analysis] migration: added column va_customer_ref.synced_at");
        }
    }
}
