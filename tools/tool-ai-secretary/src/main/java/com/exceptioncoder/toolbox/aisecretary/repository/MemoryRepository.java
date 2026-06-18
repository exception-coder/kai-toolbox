package com.exceptioncoder.toolbox.aisecretary.repository;

import com.exceptioncoder.toolbox.aisecretary.domain.Memory;
import com.exceptioncoder.toolbox.aisecretary.domain.MemoryCategory;
import com.exceptioncoder.toolbox.aisecretary.domain.MemoryStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.util.List;

/** ai_secretary_memory 的 CRUD（仿 NoteRepository：JdbcTemplate + 朴素 SQL）。 */
@Repository
public class MemoryRepository {

    private final JdbcTemplate jdbc;

    public MemoryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Memory> ROW = (rs, i) -> new Memory(
            rs.getString("id"),
            MemoryCategory.valueOf(rs.getString("category")),
            rs.getString("mem_key"),
            rs.getString("value"),
            rs.getString("detail"),
            rs.getString("source_note_id"),
            rs.getDouble("confidence"),
            MemoryStatus.valueOf(rs.getString("status")),
            rs.getInt("pinned") != 0,
            rs.getLong("created_at"),
            rs.getLong("updated_at"));

    public void insert(Memory m) {
        jdbc.update("""
                INSERT INTO ai_secretary_memory
                  (id, category, mem_key, value, detail, source_note_id, confidence, status, pinned, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                m.id(), m.category().name(), m.key(), m.value(), m.detail(), m.sourceNoteId(),
                m.confidence(), m.status().name(), m.pinned() ? 1 : 0, m.createdAt(), m.updatedAt());
    }

    public void update(Memory m) {
        jdbc.update("""
                UPDATE ai_secretary_memory
                   SET category = ?, mem_key = ?, value = ?, detail = ?, confidence = ?,
                       status = ?, pinned = ?, updated_at = ?
                 WHERE id = ?
                """,
                m.category().name(), m.key(), m.value(), m.detail(), m.confidence(),
                m.status().name(), m.pinned() ? 1 : 0, m.updatedAt(), m.id());
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM ai_secretary_memory WHERE id = ?", id);
    }

    public Memory findById(String id) {
        if (!StringUtils.hasText(id)) {
            return null;
        }
        List<Memory> rows = jdbc.query("SELECT * FROM ai_secretary_memory WHERE id = ?", ROW, id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 按状态列（active / proposed / archived），最近更新在前。 */
    public List<Memory> listByStatus(MemoryStatus status) {
        return jdbc.query("""
                SELECT * FROM ai_secretary_memory
                 WHERE status = ?
                 ORDER BY updated_at DESC
                """, ROW, status.name());
    }

    /** 去重用：同类同 key 的现存记忆（任意状态），最近更新在前。 */
    public Memory findByCategoryAndKey(MemoryCategory category, String key) {
        List<Memory> rows = jdbc.query("""
                SELECT * FROM ai_secretary_memory
                 WHERE category = ? AND mem_key = ?
                 ORDER BY updated_at DESC
                 LIMIT 1
                """, ROW, category.name(), key);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 注入用：某类 active 记忆，pinned 优先、再按更新时间倒序。 */
    public List<Memory> findActiveByCategory(MemoryCategory category, int limit) {
        return jdbc.query("""
                SELECT * FROM ai_secretary_memory
                 WHERE status = 'ACTIVE' AND category = ?
                 ORDER BY pinned DESC, updated_at DESC
                 LIMIT ?
                """, ROW, category.name(), limit);
    }
}
