package com.exceptioncoder.toolbox.aichat.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 轻量幂等迁移：给既有库的 ai_chat_message 补「耗时 / token / 缓存」指标列。
 *
 * <p>SchemaInitializer 朴素分号切分每次启动都跑且要求 DDL 幂等（IF NOT EXISTS），
 * 而 {@code ALTER TABLE ... ADD COLUMN} 非幂等（重复执行报 duplicate column），不能进 schema.sql。
 * 故在此 try/catch 兜底：新装库（schema.sql 已含这些列）命中「duplicate column」被忽略，旧库补列成功。
 * {@link ApplicationReadyEvent} 保证此时表已由 SchemaInitializer 建好。</p>
 */
@Slf4j
@Component
public class AiChatSchemaMigration {

    private static final String[] COLUMNS = {
            "latency_ms INTEGER",
            "prompt_tokens INTEGER",
            "completion_tokens INTEGER",
            "total_tokens INTEGER",
            "cached_tokens INTEGER",
    };

    private final JdbcTemplate jdbc;

    public AiChatSchemaMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void addMetricColumns() {
        for (String col : COLUMNS) {
            try {
                jdbc.execute("ALTER TABLE ai_chat_message ADD COLUMN " + col);
                log.info("[ai-chat] 迁移：ai_chat_message 已补 {} 列", col);
            } catch (Exception e) {
                // 列已存在（新装库）或表暂不存在：均无需处理，静默忽略
                log.debug("[ai-chat] {} 列迁移跳过：{}", col, e.getMessage());
            }
        }
    }
}
