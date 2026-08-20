package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewIntentAssessment;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class ReviewIntentRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public ReviewIntentRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public void insert(ReviewIntentAssessment value) {
        jdbc.update("""
                INSERT INTO claude_chat_review_turn_intent
                    (review_space_id, review_session_id, turn_id, client_message_id, pre_intent, final_intent,
                     classification_status, confidence, reason, signals_json, extracted_title, extracted_content,
                     created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(review_session_id, turn_id) DO UPDATE SET
                    client_message_id = excluded.client_message_id,
                    pre_intent = excluded.pre_intent,
                    final_intent = excluded.final_intent,
                    classification_status = excluded.classification_status,
                    confidence = excluded.confidence,
                    reason = excluded.reason,
                    signals_json = excluded.signals_json,
                    extracted_title = excluded.extracted_title,
                    extracted_content = excluded.extracted_content,
                    updated_at = excluded.updated_at
                """, value.reviewSpaceId(), value.reviewSessionId(), value.turnId(), value.clientMessageId(),
                value.preIntent(), value.finalIntent(), value.classificationStatus(), value.confidence(),
                value.reason(), writeSignals(value.signals()), value.extractedTitle(), value.extractedContent(),
                value.createdAt(), value.updatedAt());
    }

    public Optional<ReviewIntentAssessment> findByTurn(String reviewSessionId, String turnId) {
        return jdbc.query("""
                SELECT review_space_id, review_session_id, turn_id, client_message_id, pre_intent, final_intent,
                       classification_status, confidence, reason, signals_json, extracted_title, extracted_content,
                       created_at, updated_at
                FROM claude_chat_review_turn_intent
                WHERE review_session_id = ? AND turn_id = ?
                """, (rs, rowNum) -> map(rs), reviewSessionId, turnId).stream().findFirst();
    }

    public List<ReviewIntentAssessment> findByReviewSpaceId(String reviewSpaceId) {
        return jdbc.query("""
                SELECT review_space_id, review_session_id, turn_id, client_message_id, pre_intent, final_intent,
                       classification_status, confidence, reason, signals_json, extracted_title, extracted_content,
                       created_at, updated_at
                FROM claude_chat_review_turn_intent
                WHERE review_space_id = ? ORDER BY created_at
                """, (rs, rowNum) -> map(rs), reviewSpaceId);
    }

    private ReviewIntentAssessment map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new ReviewIntentAssessment(
                rs.getString("review_space_id"), rs.getString("review_session_id"), rs.getString("turn_id"),
                rs.getString("client_message_id"), rs.getString("pre_intent"), rs.getString("final_intent"),
                rs.getString("classification_status"), rs.getDouble("confidence"), rs.getString("reason"),
                readSignals(rs.getString("signals_json")), rs.getString("extracted_title"),
                rs.getString("extracted_content"), rs.getLong("created_at"), rs.getLong("updated_at"));
    }

    private String writeSignals(List<String> signals) {
        try {
            return mapper.writeValueAsString(signals == null ? List.of() : signals);
        } catch (Exception ignored) {
            return "[]";
        }
    }

    private List<String> readSignals(String json) {
        try {
            return mapper.readValue(json == null ? "[]" : json, new TypeReference<>() {});
        } catch (Exception ignored) {
            return List.of();
        }
    }
}
