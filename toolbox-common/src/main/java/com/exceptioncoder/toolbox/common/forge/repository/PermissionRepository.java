package com.exceptioncoder.toolbox.common.forge.repository;

import com.exceptioncoder.toolbox.common.forge.model.Permission;
import com.exceptioncoder.toolbox.common.forge.model.PermissionStatus;
import com.exceptioncoder.toolbox.common.forge.model.PermissionType;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * forge_permission 表读写。权限码由代码声明为权威源，仓储只提供 upsert / 失效标记，
 * 不对外暴露任意删除（后台只读）。
 */
@Repository
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class PermissionRepository {

    private final JdbcTemplate jdbc;

    public PermissionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Permission> ROW = (rs, i) -> Permission.builder()
            .id(rs.getLong("id"))
            .code(rs.getString("code"))
            .name(rs.getString("name"))
            .type(PermissionType.valueOf(rs.getString("type")))
            .module(rs.getString("module"))
            .parentCode(rs.getString("parent_code"))
            .sort(rs.getInt("sort"))
            .status(PermissionStatus.valueOf(rs.getString("status")))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public List<Permission> findAll() {
        return jdbc.query("SELECT * FROM forge_permission ORDER BY module, sort, id", ROW);
    }

    public Optional<Permission> findByCode(String code) {
        return jdbc.query("SELECT * FROM forge_permission WHERE code = ?", ROW, code).stream().findFirst();
    }

    public void insert(Permission p) {
        jdbc.update("INSERT INTO forge_permission (code, name, type, module, parent_code, sort, status, "
                        + "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                p.getCode(), p.getName(), p.getType().name(), p.getModule(), p.getParentCode(),
                p.getSort(), p.getStatus().name(), p.getCreatedAt(), p.getUpdatedAt());
    }

    /** 按 code 更新展示属性并重置为 ACTIVE（重新被代码声明）。 */
    public void updateByCode(Permission p) {
        jdbc.update("UPDATE forge_permission SET name = ?, type = ?, module = ?, parent_code = ?, sort = ?, "
                        + "status = ?, updated_at = ? WHERE code = ?",
                p.getName(), p.getType().name(), p.getModule(), p.getParentCode(), p.getSort(),
                p.getStatus().name(), p.getUpdatedAt(), p.getCode());
    }

    /** 把不在存活集合内的权限码标记为 DEPRECATED（软失效，不删除，保留孤儿绑定）。 */
    public void markDeprecatedExcept(List<String> aliveCodes, long updatedAt) {
        if (aliveCodes == null || aliveCodes.isEmpty()) {
            jdbc.update("UPDATE forge_permission SET status = 'DEPRECATED', updated_at = ? "
                    + "WHERE status = 'ACTIVE'", updatedAt);
            return;
        }
        String placeholders = String.join(",", aliveCodes.stream().map(x -> "?").toList());
        Object[] args = new Object[aliveCodes.size() + 1];
        args[0] = updatedAt;
        for (int i = 0; i < aliveCodes.size(); i++) {
            args[i + 1] = aliveCodes.get(i);
        }
        jdbc.update("UPDATE forge_permission SET status = 'DEPRECATED', updated_at = ? "
                + "WHERE status = 'ACTIVE' AND code NOT IN (" + placeholders + ")", args);
    }
}
