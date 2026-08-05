package com.exceptioncoder.toolbox.quicklaunch.repository;

import com.exceptioncoder.toolbox.quicklaunch.domain.OpenMode;
import com.exceptioncoder.toolbox.quicklaunch.domain.QuickSite;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class QuickSiteRepository {

    private static final RowMapper<QuickSite> ROW_MAPPER = (resultSet, rowNumber) -> new QuickSite(
            resultSet.getString("id"),
            resultSet.getString("title"),
            resultSet.getString("site_url"),
            resultSet.getString("group_name"),
            resultSet.getString("icon"),
            OpenMode.valueOf(resultSet.getString("open_mode")),
            resultSet.getInt("window_width"),
            resultSet.getInt("window_height"),
            resultSet.getInt("sort_order"),
            resultSet.getInt("pinned") == 1,
            resultSet.getInt("enabled") == 1,
            resultSet.getLong("open_count"),
            nullableLong(resultSet, "last_opened_at"),
            resultSet.getLong("created_at"),
            resultSet.getLong("updated_at")
    );

    private final JdbcTemplate jdbc;

    public QuickSiteRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<QuickSite> findAll() {
        return jdbc.query("""
                SELECT *
                  FROM quick_launch_site
                 ORDER BY group_name COLLATE NOCASE ASC,
                          pinned DESC,
                          sort_order ASC,
                          updated_at DESC
                """, ROW_MAPPER);
    }

    public Optional<QuickSite> findById(String id) {
        return jdbc.query("SELECT * FROM quick_launch_site WHERE id = ?", ROW_MAPPER, id)
                .stream()
                .findFirst();
    }

    public void insert(QuickSite site) {
        jdbc.update("""
                INSERT INTO quick_launch_site (
                    id, title, site_url, group_name, icon, open_mode,
                    window_width, window_height, sort_order, pinned, enabled,
                    open_count, last_opened_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                site.id(), site.title(), site.siteUrl(), site.groupName(), site.icon(), site.openMode().name(),
                site.windowWidth(), site.windowHeight(), site.sortOrder(), site.pinned() ? 1 : 0,
                site.enabled() ? 1 : 0, site.openCount(), site.lastOpenedAt(), site.createdAt(), site.updatedAt());
    }

    public int update(QuickSite site) {
        return jdbc.update("""
                UPDATE quick_launch_site
                   SET title = ?, site_url = ?, group_name = ?, icon = ?, open_mode = ?,
                       window_width = ?, window_height = ?, sort_order = ?, pinned = ?,
                       enabled = ?, updated_at = ?
                 WHERE id = ?
                """,
                site.title(), site.siteUrl(), site.groupName(), site.icon(), site.openMode().name(),
                site.windowWidth(), site.windowHeight(), site.sortOrder(), site.pinned() ? 1 : 0,
                site.enabled() ? 1 : 0, site.updatedAt(), site.id());
    }

    public int recordOpened(String id, long openedAt) {
        return jdbc.update("""
                UPDATE quick_launch_site
                   SET open_count = open_count + 1,
                       last_opened_at = ?,
                       updated_at = ?
                 WHERE id = ? AND enabled = 1
                """, openedAt, openedAt, id);
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM quick_launch_site WHERE id = ?", id);
    }

    private static Long nullableLong(java.sql.ResultSet resultSet, String column) throws java.sql.SQLException {
        long value = resultSet.getLong(column);
        return resultSet.wasNull() ? null : value;
    }
}
