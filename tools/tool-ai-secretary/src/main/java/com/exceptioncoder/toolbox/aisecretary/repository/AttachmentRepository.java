package com.exceptioncoder.toolbox.aisecretary.repository;

import com.exceptioncoder.toolbox.aisecretary.domain.Attachment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class AttachmentRepository {

    private final JdbcTemplate jdbc;

    public AttachmentRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Attachment> ROW = (rs, i) -> new Attachment(
            rs.getString("id"),
            rs.getString("note_id"),
            rs.getString("file_name"),
            rs.getString("mime_type"),
            rs.getLong("size_bytes"),
            rs.getString("stored_path"),
            rs.getLong("created_at"));

    public void insert(Attachment a) {
        jdbc.update("""
                INSERT INTO ai_secretary_attachment
                  (id, note_id, file_name, mime_type, size_bytes, stored_path, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                a.id(), a.noteId(), a.fileName(), a.mimeType(), a.sizeBytes(), a.storedPath(), a.createdAt());
    }

    public List<Attachment> findByNoteId(String noteId) {
        return jdbc.query(
                "SELECT * FROM ai_secretary_attachment WHERE note_id = ? ORDER BY created_at ASC",
                ROW, noteId);
    }

    public void deleteByNoteId(String noteId) {
        jdbc.update("DELETE FROM ai_secretary_attachment WHERE note_id = ?", noteId);
    }
}
