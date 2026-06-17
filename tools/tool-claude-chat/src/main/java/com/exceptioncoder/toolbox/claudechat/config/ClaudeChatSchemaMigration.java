package com.exceptioncoder.toolbox.claudechat.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 轻量幂等迁移：给既有库的 claude_chat_session 补 engine 列。
 *
 * <p>SchemaInitializer 的朴素分号切分每次启动都跑且要求 DDL 幂等（IF NOT EXISTS），
 * 而 {@code ALTER TABLE ... ADD COLUMN} 非幂等（重复执行报 duplicate column），不能放进 schema.sql。
 * 故在此用 try/catch 兜底：新装库（schema.sql 已含 engine 列）会命中「duplicate column」被忽略，
 * 旧库则补列成功。{@link ApplicationReadyEvent} 保证此时表已由 SchemaInitializer 建好。
 */
@Slf4j
@Component
public class ClaudeChatSchemaMigration {

    private final JdbcTemplate jdbc;

    public ClaudeChatSchemaMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void addEngineColumn() {
        try {
            jdbc.execute("ALTER TABLE claude_chat_session ADD COLUMN engine TEXT DEFAULT 'claude'");
            log.info("[claude-chat] 迁移：claude_chat_session 已补 engine 列");
        } catch (Exception e) {
            // 列已存在（新装库）或表暂不存在：均无需处理，静默忽略
            log.debug("[claude-chat] engine 列迁移跳过：{}", e.getMessage());
        }
        try {
            jdbc.execute("ALTER TABLE claude_chat_session ADD COLUMN engines TEXT");
            log.info("[claude-chat] 迁移：claude_chat_session 已补 engines 列");
        } catch (Exception e) {
            log.debug("[claude-chat] engines 列迁移跳过：{}", e.getMessage());
        }
        try {
            jdbc.execute("ALTER TABLE claude_chat_session ADD COLUMN engine_sessions TEXT");
            log.info("[claude-chat] 迁移：claude_chat_session 已补 engine_sessions 列");
        } catch (Exception e) {
            log.debug("[claude-chat] engine_sessions 列迁移跳过：{}", e.getMessage());
        }
        // 回填：engines 为空的行用当前 engine 初始化，保证列表能显示
        try {
            jdbc.update("UPDATE claude_chat_session SET engines = engine WHERE engines IS NULL OR engines = ''");
        } catch (Exception e) {
            log.debug("[claude-chat] engines 回填跳过：{}", e.getMessage());
        }
        // 第三方网关凭证列（旧库补列；新库 schema.sql 已含）
        try {
            jdbc.execute("ALTER TABLE claude_chat_session ADD COLUMN api_base_url TEXT");
            log.info("[claude-chat] 迁移：claude_chat_session 已补 api_base_url 列");
        } catch (Exception e) {
            log.debug("[claude-chat] api_base_url 列迁移跳过：{}", e.getMessage());
        }
        try {
            jdbc.execute("ALTER TABLE claude_chat_session ADD COLUMN auth_token TEXT");
            log.info("[claude-chat] 迁移：claude_chat_session 已补 auth_token 列");
        } catch (Exception e) {
            log.debug("[claude-chat] auth_token 列迁移跳过：{}", e.getMessage());
        }
    }
}
