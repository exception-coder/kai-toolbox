package com.exceptioncoder.toolbox.docviewer.repository;

import com.exceptioncoder.toolbox.docviewer.repository.entity.DocReviewNote;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class DocReviewNoteRepository {

    private static final String COLUMNS = """
            id, source_id, file_path, heading_id, heading_text, heading_level,
            category, content, status, created_at, updated_at
            """;

    private static final RowMapper<DocReviewNote> ROW_MAPPER = (rs, rowNum) -> DocReviewNote.builder()
            .id(rs.getString("id"))
            .sourceId(rs.getString("source_id"))
            .filePath(rs.getString("file_path"))
            .headingId(rs.getString("heading_id"))
            .headingText(rs.getString("heading_text"))
            .headingLevel(rs.getInt("heading_level"))
            .category(rs.getString("category"))
            .content(rs.getString("content"))
            .status(rs.getString("status"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    private final JdbcTemplate jdbc;

    public DocReviewNoteRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<DocReviewNote> listByFile(String sourceId, String filePath) {
        return jdbc.query("SELECT " + COLUMNS + " FROM doc_review_note "
                        + "WHERE source_id = ? AND file_path = ? "
                        + "ORDER BY CASE status WHEN 'OPEN' THEN 0 ELSE 1 END, updated_at DESC",
                ROW_MAPPER, sourceId, filePath);
    }

    public Optional<DocReviewNote> findByIdAndSourceId(String id, String sourceId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM doc_review_note WHERE id = ? AND source_id = ?",
                ROW_MAPPER, id, sourceId).stream().findFirst();
    }

    public void insert(DocReviewNote note) {
        jdbc.update("""
                INSERT INTO doc_review_note
                  (id, source_id, file_path, heading_id, heading_text, heading_level,
                   category, content, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                note.getId(), note.getSourceId(), note.getFilePath(), note.getHeadingId(),
                note.getHeadingText(), note.getHeadingLevel(), note.getCategory(), note.getContent(),
                note.getStatus(), note.getCreatedAt(), note.getUpdatedAt());
    }

    public int update(DocReviewNote note) {
        return jdbc.update("""
                UPDATE doc_review_note
                   SET category = ?, content = ?, status = ?, updated_at = ?
                 WHERE id = ? AND source_id = ?
                """,
                note.getCategory(), note.getContent(), note.getStatus(), note.getUpdatedAt(),
                note.getId(), note.getSourceId());
    }

    public int delete(String id, String sourceId) {
        return jdbc.update("DELETE FROM doc_review_note WHERE id = ? AND source_id = ?", id, sourceId);
    }

    public void deleteBySourceId(String sourceId) {
        jdbc.update("DELETE FROM doc_review_note WHERE source_id = ?", sourceId);
    }
}
