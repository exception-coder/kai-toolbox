package com.exceptioncoder.toolbox.common.forge.repository;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * forge_user_department 归属读写。本期单部门，user_id 为主键，故用 upsert 语义。
 */
@Repository
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class UserDepartmentRepository {

    private final JdbcTemplate jdbc;

    public UserDepartmentRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Long> findDepartmentIdByUser(long userId) {
        return jdbc.queryForList(
                        "SELECT department_id FROM forge_user_department WHERE user_id = ?", Long.class, userId)
                .stream().findFirst();
    }

    /** 所有用户 → 部门 id，供账号列表批量展示。 */
    public Map<Long, Long> findAll() {
        Map<Long, Long> map = new HashMap<>();
        jdbc.query("SELECT user_id, department_id FROM forge_user_department", (RowCallbackHandler) rs ->
                map.put(rs.getLong("user_id"), rs.getLong("department_id")));
        return map;
    }

    public int countByDepartment(long departmentId) {
        Integer cnt = jdbc.queryForObject(
                "SELECT COUNT(1) FROM forge_user_department WHERE department_id = ?", Integer.class, departmentId);
        return cnt == null ? 0 : cnt;
    }

    /** 设置归属（SQLite upsert：user_id 主键冲突则改 department_id）。 */
    public void upsert(long userId, long departmentId) {
        jdbc.update("INSERT INTO forge_user_department (user_id, department_id) VALUES (?, ?) "
                        + "ON CONFLICT(user_id) DO UPDATE SET department_id = excluded.department_id",
                userId, departmentId);
    }

    public void deleteByUser(long userId) {
        jdbc.update("DELETE FROM forge_user_department WHERE user_id = ?", userId);
    }
}
