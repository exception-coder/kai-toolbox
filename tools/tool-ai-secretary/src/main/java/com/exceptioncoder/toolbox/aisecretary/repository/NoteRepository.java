package com.exceptioncoder.toolbox.aisecretary.repository;

import com.exceptioncoder.toolbox.aisecretary.domain.Note;
import com.exceptioncoder.toolbox.aisecretary.domain.NoteCategory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

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
}
