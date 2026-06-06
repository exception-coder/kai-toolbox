package com.exceptioncoder.toolbox.workline.repository;

import com.exceptioncoder.toolbox.workline.domain.Workline;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * 工作线仓储：操作 {@code workline_line} 表。复用 toolbox-common 注册的全局 JdbcTemplate。
 * 表结构见 resources/db/workline-schema.sql。
 */
@Repository
public class WorklineRepository {

    private final JdbcTemplate jdbc;

    public WorklineRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Workline> findAll() {
        return jdbc.query(
                "SELECT * FROM workline_line ORDER BY sort_order ASC, created_at ASC",
                ROW_MAPPER);
    }

    public Optional<Workline> findById(long id) {
        return jdbc.query("SELECT * FROM workline_line WHERE id = ?", ROW_MAPPER, id)
                .stream().findFirst();
    }

    public boolean exists(long id) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM workline_line WHERE id = ?", Integer.class, id);
        return n != null && n > 0;
    }

    public long insert(Workline w) {
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO workline_line (name, description, sort_order, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, w.getName());
            ps.setString(2, w.getDescription());
            ps.setInt(3, w.getSortOrder());
            ps.setLong(4, w.getCreatedAt());
            ps.setLong(5, w.getUpdatedAt());
            return ps;
        }, kh);
        Number key = kh.getKey();
        long id = Objects.requireNonNull(key, "generated key missing").longValue();
        w.setId(id);
        return id;
    }

    public int update(long id, String name, String description, long updatedAt) {
        return jdbc.update("""
                UPDATE workline_line SET name = ?, description = ?, updated_at = ?
                WHERE id = ?
                """, name, description, updatedAt, id);
    }

    public int delete(long id) {
        return jdbc.update("DELETE FROM workline_line WHERE id = ?", id);
    }

    private static final RowMapper<Workline> ROW_MAPPER = (rs, n) -> Workline.builder()
            .id(rs.getLong("id"))
            .name(rs.getString("name"))
            .description(rs.getString("description"))
            .sortOrder(rs.getInt("sort_order"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();
}
