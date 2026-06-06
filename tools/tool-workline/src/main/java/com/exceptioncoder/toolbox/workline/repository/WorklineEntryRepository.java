package com.exceptioncoder.toolbox.workline.repository;

import com.exceptioncoder.toolbox.workline.domain.WorklineEntry;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Types;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * 工作条目仓储：操作 {@code workline_entry} 表。支持二级（parent_id 自引用）、
 * 按工作线查询、顶层条目分组计数与级联删除。
 */
@Repository
public class WorklineEntryRepository {

    private final JdbcTemplate jdbc;

    public WorklineEntryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 返回该工作线下全部条目（含两级），由 Service 组装成树。 */
    public List<WorklineEntry> findByLineId(long lineId) {
        return jdbc.query(
                "SELECT * FROM workline_entry WHERE line_id = ? ORDER BY sort_order ASC, created_at ASC",
                ROW_MAPPER, lineId);
    }

    public Optional<WorklineEntry> findById(long id) {
        return jdbc.query("SELECT * FROM workline_entry WHERE id = ?", ROW_MAPPER, id)
                .stream().findFirst();
    }

    /** 一次查出每条工作线的「顶层摘要条目」数，作左栏徽标，避免 N+1。 */
    public Map<Long, Integer> countTopLevelGroupByLine() {
        Map<Long, Integer> counts = new HashMap<>();
        jdbc.query(
                "SELECT line_id, COUNT(*) AS c FROM workline_entry WHERE parent_id IS NULL GROUP BY line_id",
                (java.sql.ResultSet rs) -> {
                    counts.put(rs.getLong("line_id"), rs.getInt("c"));
                });
        return counts;
    }

    public long insert(WorklineEntry e) {
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO workline_entry
                      (line_id, parent_id, title, core_content, achievement, sort_order, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, e.getLineId());
            if (e.getParentId() == null) {
                ps.setNull(2, Types.INTEGER);
            } else {
                ps.setLong(2, e.getParentId());
            }
            ps.setString(3, e.getTitle());
            ps.setString(4, e.getCoreContent());
            ps.setString(5, e.getAchievement());
            ps.setInt(6, e.getSortOrder());
            ps.setLong(7, e.getCreatedAt());
            ps.setLong(8, e.getUpdatedAt());
            return ps;
        }, kh);
        Number key = kh.getKey();
        long id = Objects.requireNonNull(key, "generated key missing").longValue();
        e.setId(id);
        return id;
    }

    public int update(long id, String title, String coreContent, String achievement, long updatedAt) {
        return jdbc.update("""
                UPDATE workline_entry SET title = ?, core_content = ?, achievement = ?, updated_at = ?
                WHERE id = ?
                """, title, coreContent, achievement, updatedAt, id);
    }

    public int delete(long id) {
        return jdbc.update("DELETE FROM workline_entry WHERE id = ?", id);
    }

    /** 删除某摘要条目的全部明细子条目。 */
    public int deleteByParentId(long parentId) {
        return jdbc.update("DELETE FROM workline_entry WHERE parent_id = ?", parentId);
    }

    public int deleteByLineId(long lineId) {
        return jdbc.update("DELETE FROM workline_entry WHERE line_id = ?", lineId);
    }

    private static final RowMapper<WorklineEntry> ROW_MAPPER = (rs, n) -> {
        long parent = rs.getLong("parent_id");
        Long parentId = rs.wasNull() ? null : parent;
        return WorklineEntry.builder()
                .id(rs.getLong("id"))
                .lineId(rs.getLong("line_id"))
                .parentId(parentId)
                .title(rs.getString("title"))
                .coreContent(rs.getString("core_content"))
                .achievement(rs.getString("achievement"))
                .sortOrder(rs.getInt("sort_order"))
                .createdAt(rs.getLong("created_at"))
                .updatedAt(rs.getLong("updated_at"))
                .build();
    };
}
