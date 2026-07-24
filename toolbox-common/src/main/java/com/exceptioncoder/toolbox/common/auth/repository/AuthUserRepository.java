package com.exceptioncoder.toolbox.common.auth.repository;

import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * auth_user 表读写。roles 在库中逗号分隔，这里负责与 List 互转。
 */
@Repository
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class AuthUserRepository {

    private final JdbcTemplate jdbc;

    public AuthUserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<AuthUser> ROW = (rs, i) -> AuthUser.builder()
            .id(rs.getLong("id"))
            .username(rs.getString("username"))
            .passwordHash(rs.getString("password_hash"))
            .realName(rs.getString("real_name"))
            .roles(splitRoles(rs.getString("roles")))
            .enabled(rs.getInt("enabled") == 1)
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public Optional<AuthUser> findByUsername(String username) {
        return jdbc.query("SELECT * FROM auth_user WHERE username = ?", ROW, username)
                .stream().findFirst();
    }

    public Optional<AuthUser> findById(long id) {
        return jdbc.query("SELECT * FROM auth_user WHERE id = ?", ROW, id)
                .stream().findFirst();
    }

    public boolean existsByUsername(String username) {
        Integer cnt = jdbc.queryForObject(
                "SELECT COUNT(1) FROM auth_user WHERE username = ?", Integer.class, username);
        return cnt != null && cnt > 0;
    }

    public long count() {
        Integer cnt = jdbc.queryForObject("SELECT COUNT(1) FROM auth_user", Integer.class);
        return cnt == null ? 0 : cnt;
    }

    /**
     * 插入并回填自增主键。
     */
    public long insert(AuthUser user) {
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO auth_user (username, password_hash, real_name, roles, enabled, "
                            + "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, user.getUsername());
            ps.setString(2, user.getPasswordHash());
            ps.setString(3, user.getRealName());
            ps.setString(4, joinRoles(user.getRoles()));
            ps.setInt(5, user.isEnabled() ? 1 : 0);
            ps.setLong(6, user.getCreatedAt());
            ps.setLong(7, user.getUpdatedAt());
            return ps;
        }, kh);
        Number key = kh.getKey();
        return key == null ? 0 : key.longValue();
    }

    public void updatePassword(long userId, String passwordHash, long updatedAt) {
        jdbc.update("UPDATE auth_user SET password_hash = ?, updated_at = ? WHERE id = ?",
                passwordHash, updatedAt, userId);
    }

    public List<AuthUser> findAll() {
        return jdbc.query("SELECT * FROM auth_user ORDER BY id", ROW);
    }

    public void updateRoles(long userId, List<String> roles, long updatedAt) {
        jdbc.update("UPDATE auth_user SET roles = ?, updated_at = ? WHERE id = ?",
                joinRoles(roles), updatedAt, userId);
    }

    public void updateRealName(long userId, String realName, long updatedAt) {
        jdbc.update("UPDATE auth_user SET real_name = ?, updated_at = ? WHERE id = ?",
                realName, updatedAt, userId);
    }

    public void updateEnabled(long userId, boolean enabled, long updatedAt) {
        jdbc.update("UPDATE auth_user SET enabled = ?, updated_at = ? WHERE id = ?",
                enabled ? 1 : 0, updatedAt, userId);
    }

    public void deleteById(long userId) {
        jdbc.update("DELETE FROM auth_user WHERE id = ?", userId);
    }

    private static List<String> splitRoles(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    private static String joinRoles(List<String> roles) {
        if (roles == null || roles.isEmpty()) {
            return "USER";
        }
        return String.join(",", roles);
    }
}
