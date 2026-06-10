package com.exceptioncoder.toolbox.aisecretary.repository;

import com.exceptioncoder.toolbox.aisecretary.domain.ExpenseSummary;
import com.exceptioncoder.toolbox.aisecretary.domain.Note;
import com.exceptioncoder.toolbox.aisecretary.domain.NoteCategory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

@Repository
public class NoteRepository {

    private final JdbcTemplate jdbc;

    public NoteRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Note> ROW = (rs, i) -> new Note(
            rs.getString("id"),
            rs.getString("raw_text"),
            NoteCategory.fromLabel(rs.getString("category")),
            rs.getString("title"),
            rs.getString("due_time"),
            rs.getObject("amount") == null ? null : rs.getDouble("amount"),
            rs.getString("tags"),
            rs.getDouble("confidence"),
            rs.getInt("needs_review") != 0,
            rs.getString("status"),
            rs.getLong("created_at"));

    public void insert(Note n) {
        jdbc.update("""
                INSERT INTO ai_secretary_note
                  (id, raw_text, category, title, due_time, amount, tags, confidence, needs_review, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                n.id(), n.rawText(), n.category().name(), n.title(), n.dueTime(),
                n.amount(), n.tagsJson(), n.confidence(),
                n.needsReview() ? 1 : 0, n.status(), n.createdAt());
    }

    public List<Note> findRecent(int limit) {
        return jdbc.query("""
                SELECT * FROM ai_secretary_note
                 ORDER BY created_at DESC
                 LIMIT ?
                """, ROW, limit);
    }

    /** 关键字（标题/原文 LIKE）+ 可选类目枚举名 + 可选时间区间。各条件均可空。 */
    public List<Note> search(String keyword, String categoryName, Long fromTs, Long toTs, int limit) {
        StringBuilder sql = new StringBuilder("SELECT * FROM ai_secretary_note WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (StringUtils.hasText(keyword)) {
            sql.append(" AND (title LIKE ? OR raw_text LIKE ?)");
            String like = "%" + keyword.trim() + "%";
            args.add(like);
            args.add(like);
        }
        if (StringUtils.hasText(categoryName)) {
            sql.append(" AND category = ?");
            args.add(categoryName);
        }
        if (fromTs != null) {
            sql.append(" AND created_at >= ?");
            args.add(fromTs);
        }
        if (toTs != null) {
            sql.append(" AND created_at < ?");
            args.add(toTs);
        }
        sql.append(" ORDER BY created_at DESC LIMIT ?");
        args.add(limit);
        return jdbc.query(sql.toString(), ROW, args.toArray());
    }

    /** 开销求和（仅 EXPENSE 且 amount 非空）+ 可选关键字 + 可选时间区间。 */
    public ExpenseSummary sumExpense(String keyword, Long fromTs, Long toTs) {
        StringBuilder sql = new StringBuilder(
                "SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt FROM ai_secretary_note "
                        + "WHERE category = 'EXPENSE' AND amount IS NOT NULL");
        List<Object> args = new ArrayList<>();
        if (StringUtils.hasText(keyword)) {
            sql.append(" AND (title LIKE ? OR raw_text LIKE ?)");
            String like = "%" + keyword.trim() + "%";
            args.add(like);
            args.add(like);
        }
        if (fromTs != null) {
            sql.append(" AND created_at >= ?");
            args.add(fromTs);
        }
        if (toTs != null) {
            sql.append(" AND created_at < ?");
            args.add(toTs);
        }
        return jdbc.queryForObject(sql.toString(),
                (rs, i) -> new ExpenseSummary(rs.getDouble("total"), rs.getInt("cnt")),
                args.toArray());
    }

    /** 待办列表：category=TODO，按状态过滤。 */
    public List<Note> findTodos(String status, int limit) {
        String st = StringUtils.hasText(status) ? status.trim() : "open";
        return jdbc.query("""
                SELECT * FROM ai_secretary_note
                 WHERE category = 'TODO' AND status = ?
                 ORDER BY created_at DESC
                 LIMIT ?
                """, ROW, st, limit);
    }
}
