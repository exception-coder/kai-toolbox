package com.exceptioncoder.toolbox.browserrequest.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 轻量幂等迁移：给既有库的 browser_request_session 补 engine 列（按会话选引擎 playwright-java / undetected-node）。
 *
 * <p>ALTER TABLE ADD COLUMN 非幂等（重复执行报 duplicate column），不能放进朴素分号切分的 schema.sql；
 * 故在此 try/catch 兜底：新装库（schema.sql 已含 engine 列）命中 duplicate column 被忽略，旧库则补列成功。
 */
@Slf4j
@Component
public class BrowserRequestSchemaMigration {

    private final JdbcTemplate jdbc;

    public BrowserRequestSchemaMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void addEngineColumn() {
        try {
            jdbc.execute("ALTER TABLE browser_request_session ADD COLUMN engine TEXT");
            log.info("[browser-request] 迁移：browser_request_session 已补 engine 列");
        } catch (Exception e) {
            log.debug("[browser-request] engine 列迁移跳过：{}", e.getMessage());
        }
    }
}
