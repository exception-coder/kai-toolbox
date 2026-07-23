package com.exceptioncoder.toolbox.common.forge.repository;

import com.exceptioncoder.toolbox.common.forge.model.DataScopeType;
import com.exceptioncoder.toolbox.common.forge.model.EntityStatus;
import com.exceptioncoder.toolbox.common.forge.model.Role;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * forge_role 表读写。
 */
@Repository
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class RoleRepository {

    private final JdbcTemplate jdbc;

    public RoleRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Role> ROW = (rs, i) -> Role.builder()
            .id(rs.getLong("id"))
            .name(rs.getString("name"))
            .code(rs.getString("code"))
            .description(rs.getString("description"))
            .builtin(rs.getInt("builtin") == 1)
            .dataScopeType(DataScopeType.valueOf(rs.getString("data_scope_type")))
            .status(EntityStatus.valueOf(rs.getString("status")))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public List<Role> findAll() {
        return jdbc.query("SELECT * FROM forge_role ORDER BY id", ROW);
    }

    public Optional<Role> findById(long id) {
        return jdbc.query("SELECT * FROM forge_role WHERE id = ?", ROW, id).stream().findFirst();
    }

    public Optional<Role> findByCode(String code) {
        return jdbc.query("SELECT * FROM forge_role WHERE code = ?", ROW, code).stream().findFirst();
    }

    public List<Role> findByIds(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        String placeholders = String.join(",", ids.stream().map(x -> "?").toList());
        return jdbc.query("SELECT * FROM forge_role WHERE id IN (" + placeholders + ")", ROW, ids.toArray());
    }

    public boolean existsByCode(String code) {
        Integer cnt = jdbc.queryForObject("SELECT COUNT(1) FROM forge_role WHERE code = ?", Integer.class, code);
        return cnt != null && cnt > 0;
    }

    public long count() {
        Integer cnt = jdbc.queryForObject("SELECT COUNT(1) FROM forge_role", Integer.class);
        return cnt == null ? 0 : cnt;
    }

    public long insert(Role role) {
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO forge_role (name, code, description, builtin, data_scope_type, status, "
                            + "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, role.getName());
            ps.setString(2, role.getCode());
            ps.setString(3, role.getDescription());
            ps.setInt(4, role.isBuiltin() ? 1 : 0);
            ps.setString(5, role.getDataScopeType().name());
            ps.setString(6, role.getStatus().name());
            ps.setLong(7, role.getCreatedAt());
            ps.setLong(8, role.getUpdatedAt());
            return ps;
        }, kh);
        Number key = kh.getKey();
        return key == null ? 0 : key.longValue();
    }

    public void update(Role role) {
        jdbc.update("UPDATE forge_role SET name = ?, code = ?, description = ?, data_scope_type = ?, "
                        + "status = ?, updated_at = ? WHERE id = ?",
                role.getName(), role.getCode(), role.getDescription(), role.getDataScopeType().name(),
                role.getStatus().name(), role.getUpdatedAt(), role.getId());
    }

    public void deleteById(long id) {
        jdbc.update("DELETE FROM forge_role WHERE id = ?", id);
    }
}
