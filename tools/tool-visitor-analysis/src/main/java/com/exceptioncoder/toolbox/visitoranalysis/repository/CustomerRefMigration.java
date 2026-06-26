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
        addColumnIfMissing("synced_at", "INTEGER");
        // 客户底库同步新增列：企业电话/联系人手机(+归一化) 与增量水位
        addColumnIfMissing("tel", "TEXT");
        addColumnIfMissing("tel_norm", "TEXT");
        addColumnIfMissing("contact_mobile", "TEXT");
        addColumnIfMissing("contact_mobile_norm", "TEXT");
        addColumnIfMissing("src_lastdate", "INTEGER");
    }

    /** pragma 检查后追加列，幂等（列名为内部常量，非外部输入）。 */
    private void addColumnIfMissing(String column, String type) {
        Integer present = jdbc.queryForObject(
                "SELECT COUNT(*) FROM pragma_table_info('va_customer_ref') WHERE name = ?",
                Integer.class, column);
        if (present == null || present == 0) {
            jdbc.execute("ALTER TABLE va_customer_ref ADD COLUMN " + column + " " + type);
            log.info("[visitor-analysis] migration: added column va_customer_ref.{}", column);
        }
    }
}
