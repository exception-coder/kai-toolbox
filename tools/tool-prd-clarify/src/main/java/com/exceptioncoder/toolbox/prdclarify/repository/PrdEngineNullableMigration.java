package com.exceptioncoder.toolbox.prdclarify.repository;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Map;

/**
 * 将历史库中 {@code prd_session.engine} 从 NOT NULL 调整为可空。
 * 草稿尚未发起 Agent，不应提前绑定执行引擎；真正开始澄清时才写 claude/codex。
 */
@Component
@DependsOn("schemaInitializer")
public class PrdEngineNullableMigration {

    private static final Logger log = LoggerFactory.getLogger(PrdEngineNullableMigration.class);
    private static final String TEMP_COLUMN = "engine_nullable_migration";

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;

    public PrdEngineNullableMigration(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    @PostConstruct
    public void migrate() {
        Map<String, Object> engineColumn = jdbc.queryForList("PRAGMA table_info(prd_session)").stream()
                .filter(column -> "engine".equals(String.valueOf(column.get("name"))))
                .findFirst()
                .orElse(null);
        if (engineColumn == null || number(engineColumn.get("notnull")) == 0) return;

        transaction.executeWithoutResult(status -> {
            jdbc.execute("ALTER TABLE prd_session ADD COLUMN " + TEMP_COLUMN + " TEXT");
            jdbc.update("UPDATE prd_session SET " + TEMP_COLUMN + " = engine");
            jdbc.execute("ALTER TABLE prd_session DROP COLUMN engine");
            jdbc.execute("ALTER TABLE prd_session RENAME COLUMN " + TEMP_COLUMN + " TO engine");
        });
        log.info("[prd-clarify] migration: engine 已改为可空，草稿不再提前绑定 Agent 引擎");
    }

    private static int number(Object value) {
        return value instanceof Number number ? number.intValue() : Integer.parseInt(String.valueOf(value));
    }
}
