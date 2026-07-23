package com.exceptioncoder.toolbox.common.forge.repository;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

/**
 * forge_user_role 绑定读写。user_id 逻辑引用 auth_user.id。多角色全量覆盖由 service 层事务内完成。
 */
@Repository
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class UserRoleRepository {

    private final JdbcTemplate jdbc;

    public UserRoleRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Long> findRoleIdsByUser(long userId) {
        return jdbc.queryForList(
                "SELECT role_id FROM forge_user_role WHERE user_id = ?", Long.class, userId);
    }

    /** 解析用户已绑、且启用（ENABLED）的角色 code 集合——作为 JWT roles 权威源。 */
    public List<String> findEnabledRoleCodesByUser(long userId) {
        return jdbc.queryForList(
                "SELECT r.code FROM forge_user_role ur JOIN forge_role r ON r.id = ur.role_id "
                        + "WHERE ur.user_id = ? AND r.status = 'ENABLED'",
                String.class, userId);
    }

    public int countByRole(long roleId) {
        Integer cnt = jdbc.queryForObject(
                "SELECT COUNT(1) FROM forge_user_role WHERE role_id = ?", Integer.class, roleId);
        return cnt == null ? 0 : cnt;
    }

    public void deleteByUser(long userId) {
        jdbc.update("DELETE FROM forge_user_role WHERE user_id = ?", userId);
    }

    public void insertBatch(long userId, Collection<Long> roleIds) {
        if (roleIds == null || roleIds.isEmpty()) {
            return;
        }
        jdbc.batchUpdate("INSERT INTO forge_user_role (user_id, role_id) VALUES (?, ?)",
                roleIds.stream().map(rid -> new Object[]{userId, rid}).toList());
    }

    public void insert(long userId, long roleId) {
        jdbc.update("INSERT INTO forge_user_role (user_id, role_id) VALUES (?, ?)", userId, roleId);
    }

    public boolean exists(long userId, long roleId) {
        Integer cnt = jdbc.queryForObject(
                "SELECT COUNT(1) FROM forge_user_role WHERE user_id = ? AND role_id = ?",
                Integer.class, userId, roleId);
        return cnt != null && cnt > 0;
    }
}
