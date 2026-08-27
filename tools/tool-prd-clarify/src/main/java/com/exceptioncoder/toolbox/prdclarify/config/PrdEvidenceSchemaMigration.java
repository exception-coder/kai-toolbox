package com.exceptioncoder.toolbox.prdclarify.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** 为存量规格探索运行补充证据轨迹列。 */
@Slf4j
@Component
public class PrdEvidenceSchemaMigration {

    private final JdbcTemplate jdbc;

    public PrdEvidenceSchemaMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void migrate() {
        try {
            jdbc.execute("ALTER TABLE prd_discovery_run ADD COLUMN evidence_trace_json TEXT");
            log.info("[prd-discovery] 迁移：prd_discovery_run 已补 evidence_trace_json 列");
        } catch (Exception error) {
            log.debug("[prd-discovery] evidence trace 列迁移跳过：{}", error.getMessage());
        }
    }
}
