package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultFeedback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * consult_feedback 表的数据访问层。JdbcTemplate + 静态 RowMapper，与其他模块一致。
 */
@Repository
public class ConsultFeedbackRepository {

    private static final RowMapper<ConsultFeedback> ROW = (rs, i) -> ConsultFeedback.builder()
            .sessionId(rs.getString("session_id"))
            .turnIndex(rs.getInt("turn_index"))
            .rating(rs.getString("rating"))
            .category(rs.getString("category"))
            .reason(rs.getString("reason"))
            .correctAnswer(rs.getString("correct_answer"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    private final JdbcTemplate jdbc;

    public ConsultFeedbackRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ConsultFeedback> findBySession(String sessionId) {
        return jdbc.query("SELECT * FROM consult_feedback WHERE session_id = ? ORDER BY turn_index ASC", ROW, sessionId);
    }

    /** 以 (session_id,turn_index) 为键 upsert。 */
    public void upsert(ConsultFeedback f) {
        jdbc.update(
                "INSERT INTO consult_feedback (session_id, turn_index, rating, category, reason, correct_answer, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
                "ON CONFLICT(session_id, turn_index) DO UPDATE SET " +
                "rating = excluded.rating, category = excluded.category, reason = excluded.reason, " +
                "correct_answer = excluded.correct_answer, updated_at = excluded.updated_at",
                f.getSessionId(), f.getTurnIndex(), f.getRating(), f.getCategory(), f.getReason(),
                f.getCorrectAnswer(), f.getCreatedAt(), f.getUpdatedAt());
    }

    public void deleteBySession(String sessionId) {
        jdbc.update("DELETE FROM consult_feedback WHERE session_id = ?", sessionId);
    }
}
