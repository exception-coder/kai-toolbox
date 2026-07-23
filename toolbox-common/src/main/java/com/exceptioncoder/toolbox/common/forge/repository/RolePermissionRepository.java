package com.exceptioncoder.toolbox.common.forge.repository;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

/**
 * forge_role_permission 绑定读写。全量覆盖式绑定由 service 层在事务内 deleteByRole + batch insert 完成。
 */
@Repository
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class RolePermissionRepository {

    private final JdbcTemplate jdbc;

    public RolePermissionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Long> findPermissionIdsByRole(long roleId) {
        return jdbc.queryForList(
                "SELECT permission_id FROM forge_role_permission WHERE role_id = ?", Long.class, roleId);
    }

    /**
     * 解析一批角色可见的、当前仍存活（ACTIVE）的权限码并集。DEPRECATED 权限码不下发。
     */
    public List<String> findActivePermissionCodesByRoleIds(Collection<Long> roleIds) {
        if (roleIds == null || roleIds.isEmpty()) {
            return List.of();
        }
        String placeholders = String.join(",", roleIds.stream().map(x -> "?").toList());
        return jdbc.queryForList(
                "SELECT DISTINCT p.code FROM forge_role_permission rp "
                        + "JOIN forge_permission p ON p.id = rp.permission_id "
                        + "WHERE rp.role_id IN (" + placeholders + ") AND p.status = 'ACTIVE'",
                String.class, roleIds.toArray());
    }

    public void deleteByRole(long roleId) {
        jdbc.update("DELETE FROM forge_role_permission WHERE role_id = ?", roleId);
    }

    public void insertBatch(long roleId, Collection<Long> permissionIds) {
        if (permissionIds == null || permissionIds.isEmpty()) {
            return;
        }
        jdbc.batchUpdate("INSERT INTO forge_role_permission (role_id, permission_id) VALUES (?, ?)",
                permissionIds.stream().map(pid -> new Object[]{roleId, pid}).toList());
    }
}
