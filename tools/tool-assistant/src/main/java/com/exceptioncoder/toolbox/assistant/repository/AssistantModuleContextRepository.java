package com.exceptioncoder.toolbox.assistant.repository;

import com.exceptioncoder.toolbox.assistant.domain.AssistantModuleContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/** Assistant 模块探索摘要持久化。 */
@Repository
public class AssistantModuleContextRepository {

    private final JdbcTemplate jdbc;

    public AssistantModuleContextRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 按用户、应用和稳定模块标识读取唯一摘要。 */
    public Optional<AssistantModuleContext> find(long creatorUserId, String appId, String moduleKey) {
        return jdbc.query("""
                SELECT id, creator_user_id, app_id, module_key, route, source_revision,
                       summary_text, expires_at, create_time, update_time
                  FROM assistant_module_context_cache
                 WHERE creator_user_id = ? AND app_id = ? AND module_key = ?
                 LIMIT 1
                """, (resultSet, rowNum) -> new AssistantModuleContext(
                resultSet.getString("id"), resultSet.getLong("creator_user_id"),
                resultSet.getString("app_id"), resultSet.getString("module_key"),
                resultSet.getString("route"), resultSet.getString("source_revision"),
                resultSet.getString("summary_text"), resultSet.getLong("expires_at"),
                resultSet.getLong("create_time"), resultSet.getLong("update_time")),
                creatorUserId, appId, moduleKey).stream().findFirst();
    }

    /** 原子新增或刷新同一用户模块的摘要。 */
    public void upsert(AssistantModuleContext context) {
        jdbc.update("""
                INSERT INTO assistant_module_context_cache
                  (id, creator_user_id, app_id, module_key, route, source_revision, summary_text,
                   expires_at, create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(creator_user_id, app_id, module_key) DO UPDATE SET
                  route = excluded.route,
                  source_revision = excluded.source_revision,
                  summary_text = excluded.summary_text,
                  expires_at = excluded.expires_at,
                  update_time = excluded.update_time
                """, context.id(), context.creatorUserId(), context.appId(), context.moduleKey(),
                context.route(), context.sourceRevision(), context.summary(), context.expiresAt(),
                context.createTime(), context.updateTime());
    }
}
