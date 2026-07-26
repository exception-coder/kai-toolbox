package com.exceptioncoder.toolbox.common.menuvisibility.repository;

import com.exceptioncoder.toolbox.common.menuvisibility.domain.MenuVisibility;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * 菜单显隐偏好持久化：一个用户一行，手写 JdbcTemplate（与 FeatureConfigRepository 一致）。
 */
@Repository
public class MenuVisibilityRepository {

    private final JdbcTemplate jdbc;

    public MenuVisibilityRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<MenuVisibility> ROW = (rs, i) -> MenuVisibility.builder()
            .userId(rs.getLong("user_id"))
            .visibleIdsJson(rs.getString("visible_ids_json"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public Optional<MenuVisibility> findByUser(long userId) {
        return jdbc.query(
                "SELECT * FROM menu_visibility WHERE user_id = ?",
                ROW, userId
        ).stream().findFirst();
    }

    /** SQLite 原生 UPSERT，单语句完成 INSERT/UPDATE。 */
    public void upsert(MenuVisibility mv) {
        jdbc.update("""
                INSERT INTO menu_visibility (user_id, visible_ids_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    visible_ids_json = excluded.visible_ids_json,
                    updated_at       = excluded.updated_at
                """,
                mv.getUserId(), mv.getVisibleIdsJson(), mv.getUpdatedAt());
    }

    /** 幂等：不存在也不报错（用于「恢复默认」）。 */
    public void deleteByUser(long userId) {
        jdbc.update("DELETE FROM menu_visibility WHERE user_id = ?", userId);
    }
}
