package com.exceptioncoder.toolbox.ops.repository;

import com.exceptioncoder.toolbox.ops.domain.OpsSystem;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class SystemRepository {

    private final JdbcTemplate jdbc;

    public SystemRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<OpsSystem> ROW = (rs, i) -> OpsSystem.builder()
            .id(rs.getString("id"))
            .name(rs.getString("name"))
            .code(rs.getString("code"))
            .owner(rs.getString("owner"))
            .description(rs.getString("description"))
            .sortOrder(rs.getInt("sort_order"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public List<OpsSystem> findAll() {
        return jdbc.query("SELECT * FROM ops_system ORDER BY sort_order ASC, name ASC", ROW);
    }

    public Optional<OpsSystem> findById(String id) {
        return jdbc.query("SELECT * FROM ops_system WHERE id = ?", ROW, id).stream().findFirst();
    }

    public void insert(OpsSystem s) {
        jdbc.update("""
                INSERT INTO ops_system
                  (id, name, code, owner, description, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                s.getId(), s.getName(), s.getCode(), s.getOwner(), s.getDescription(),
                s.getSortOrder(), s.getCreatedAt(), s.getUpdatedAt());
    }

    public void update(OpsSystem s) {
        jdbc.update("""
                UPDATE ops_system
                   SET name = ?, code = ?, owner = ?, description = ?, sort_order = ?, updated_at = ?
                 WHERE id = ?
                """,
                s.getName(), s.getCode(), s.getOwner(), s.getDescription(),
                s.getSortOrder(), s.getUpdatedAt(), s.getId());
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM ops_system WHERE id = ?", id);
    }
}
