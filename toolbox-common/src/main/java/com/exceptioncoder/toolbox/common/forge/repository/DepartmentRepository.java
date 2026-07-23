package com.exceptioncoder.toolbox.common.forge.repository;

import com.exceptioncoder.toolbox.common.forge.model.Department;
import com.exceptioncoder.toolbox.common.forge.model.EntityStatus;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Optional;

/**
 * forge_department 表读写。树形以 parent_id 表达。
 */
@Repository
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class DepartmentRepository {

    private final JdbcTemplate jdbc;

    public DepartmentRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Department> ROW = (rs, i) -> Department.builder()
            .id(rs.getLong("id"))
            .parentId(rs.getLong("parent_id"))
            .name(rs.getString("name"))
            .code(rs.getString("code"))
            .sort(rs.getInt("sort"))
            .status(EntityStatus.valueOf(rs.getString("status")))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public List<Department> findAll() {
        return jdbc.query("SELECT * FROM forge_department ORDER BY parent_id, sort, id", ROW);
    }

    public Optional<Department> findById(long id) {
        return jdbc.query("SELECT * FROM forge_department WHERE id = ?", ROW, id).stream().findFirst();
    }

    public boolean existsByCode(String code) {
        Integer cnt = jdbc.queryForObject(
                "SELECT COUNT(1) FROM forge_department WHERE code = ?", Integer.class, code);
        return cnt != null && cnt > 0;
    }

    public int countChildren(long parentId) {
        Integer cnt = jdbc.queryForObject(
                "SELECT COUNT(1) FROM forge_department WHERE parent_id = ?", Integer.class, parentId);
        return cnt == null ? 0 : cnt;
    }

    public long insert(Department dept) {
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO forge_department (parent_id, name, code, sort, status, created_at, updated_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, dept.getParentId());
            ps.setString(2, dept.getName());
            ps.setString(3, dept.getCode());
            ps.setInt(4, dept.getSort());
            ps.setString(5, dept.getStatus().name());
            ps.setLong(6, dept.getCreatedAt());
            ps.setLong(7, dept.getUpdatedAt());
            return ps;
        }, kh);
        Number key = kh.getKey();
        return key == null ? 0 : key.longValue();
    }

    public void update(Department dept) {
        jdbc.update("UPDATE forge_department SET parent_id = ?, name = ?, code = ?, sort = ?, status = ?, "
                        + "updated_at = ? WHERE id = ?",
                dept.getParentId(), dept.getName(), dept.getCode(), dept.getSort(),
                dept.getStatus().name(), dept.getUpdatedAt(), dept.getId());
    }

    public void deleteById(long id) {
        jdbc.update("DELETE FROM forge_department WHERE id = ?", id);
    }
}
