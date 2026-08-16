package com.exceptioncoder.toolbox.reqpool.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 需求池跨表集成查询仓库，集中隔离 PRD 会话与账号表的 SQLite 访问细节。
 */
@Repository
public class ReqPoolIntegrationRepository {

    private final JdbcTemplate jdbc;

    public ReqPoolIntegrationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 查询启用账号的稳定 ID 与显示名称。 */
    public Optional<Map<String, Object>> findEnabledUser(Long userId) {
        List<Map<String, Object>> users = jdbc.queryForList(
                "SELECT id, username, real_name FROM auth_user WHERE id = ? AND enabled = 1",
                userId
        );
        return users.stream().findFirst();
    }

    /** 查询 PRD 当前绑定的开发会话。 */
    public String findDevSessionId(String prdSessionId) {
        return jdbc.query(
                "SELECT dev_session_id FROM prd_session WHERE id = ?",
                resultSet -> resultSet.next() ? resultSet.getString(1) : null,
                prdSessionId
        );
    }

    /** 查询非草稿 PRD 已确认的需求类型。 */
    public String findConfirmedPrdType(String prdSessionId) {
        if (prdSessionId == null || prdSessionId.isBlank()) {
            return null;
        }
        return jdbc.query(
                "SELECT CASE WHEN status = 'DRAFT' THEN NULL ELSE req_type END FROM prd_session WHERE id = ?",
                resultSet -> resultSet.next() ? resultSet.getString(1) : null,
                prdSessionId
        );
    }

    /** 将用户主动删除的 PRD 镜像加入排除集合。 */
    public void excludePrdSession(String prdSessionId, long excludedAt) {
        jdbc.update("""
                INSERT INTO req_pool_prd_exclusion (prd_session_id, excluded_at)
                VALUES (?, ?)
                ON CONFLICT(prd_session_id) DO UPDATE SET excluded_at = excluded.excluded_at
                """, prdSessionId, excludedAt);
    }

    /** 查询允许同步到需求池的 PRD 会话投影。 */
    public List<Map<String, Object>> findSyncablePrdSessions() {
        return jdbc.queryForList("""
                SELECT id, title, raw_input, project, module, status,
                       CASE WHEN status = 'DRAFT' THEN NULL ELSE req_type END AS req_type
                FROM prd_session
                WHERE status IN ('DRAFT', 'DONE', 'CLARIFYING')
                  AND NOT EXISTS (
                    SELECT 1 FROM req_pool_prd_exclusion
                    WHERE req_pool_prd_exclusion.prd_session_id = prd_session.id
                  )
                """);
    }

    /** 删除源 PRD 已不存在的需求池镜像。 */
    public int deleteOrphanMirrors() {
        return jdbc.update("""
                DELETE FROM req_pool_item
                WHERE prd_session_id IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM prd_session
                    WHERE prd_session.id = req_pool_item.prd_session_id
                  )
                """);
    }

    /** 清理源 PRD 已不存在的排除记录。 */
    public void deleteOrphanExclusions() {
        jdbc.update("""
                DELETE FROM req_pool_prd_exclusion
                WHERE NOT EXISTS (
                  SELECT 1 FROM prd_session
                  WHERE prd_session.id = req_pool_prd_exclusion.prd_session_id
                )
                """);
    }

    /** 查询同一 PRD 的全部历史镜像，优先返回已补充负责人和承诺信息的记录。 */
    public List<Map<String, Object>> findMirrors(String prdSessionId) {
        return jdbc.queryForList("""
                SELECT id, title, description, project, module, status,
                       req_type, req_type_source, req_type_confidence
                FROM req_pool_item
                WHERE prd_session_id = ?
                ORDER BY CASE WHEN assignee_user_id IS NOT NULL OR assignee IS NOT NULL THEN 0 ELSE 1 END,
                         CASE WHEN deadline IS NOT NULL AND deadline <> '' THEN 0 ELSE 1 END,
                         created_at ASC
                """, prdSessionId);
    }

    /** 更新 PRD 事实源负责的镜像字段。 */
    public void updateMirror(
            String id,
            String title,
            String description,
            String project,
            String module,
            String status,
            String requirementType,
            String requirementTypeSource,
            double requirementTypeConfidence,
            long updatedAt
    ) {
        jdbc.update("""
                UPDATE req_pool_item
                SET title = ?, description = ?, project = ?, module = ?, status = ?,
                    req_type = ?, req_type_source = ?, req_type_confidence = ?, updated_at = ?
                WHERE id = ?
                """, title, description, project, module, status, requirementType,
                requirementTypeSource, requirementTypeConfidence, updatedAt, id);
    }

    /** 查询修订版与拆分子需求的 PRD 会话 ID。 */
    public Set<String> findChildPrdSessionIds() {
        return jdbc.queryForList(
                        "SELECT id FROM prd_session WHERE parent_id IS NOT NULL AND parent_id <> ''",
                        String.class
                ).stream()
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
    }
}
