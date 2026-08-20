package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewFeedback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** 评审反馈的本地持久化仓储。 */
@Repository
public class ReviewFeedbackRepository {
    private static final String COLUMNS = """
            id, review_space_id, source_session_id, review_session_id, content,
            source_message_id, status, created_at, handled_at
            """;
    private static final RowMapper<ReviewFeedback> ROW = (rs, rowNum) -> new ReviewFeedback(
            rs.getString("id"), rs.getString("review_space_id"), rs.getString("source_session_id"),
            rs.getString("review_session_id"), rs.getString("content"), rs.getString("source_message_id"),
            rs.getString("status"), rs.getLong("created_at"),
            rs.getObject("handled_at") == null ? null : rs.getLong("handled_at"));

    private final JdbcTemplate jdbc;

    public ReviewFeedbackRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 写入待处理评审意见；相同评审消息重复提交时返回既有记录。 */
    public ReviewFeedback insertOrFind(ReviewFeedback feedback) {
        int inserted = jdbc.update("""
                INSERT OR IGNORE INTO claude_chat_review_feedback
                  (id, review_space_id, source_session_id, review_session_id, content,
                   source_message_id, status, created_at, handled_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, feedback.id(), feedback.reviewSpaceId(), feedback.sourceSessionId(),
                feedback.reviewSessionId(), feedback.content(), feedback.sourceMessageId(),
                feedback.status(), feedback.createdAt(), feedback.handledAt());
        if (inserted > 0) {
            return feedback;
        }
        return findByMessage(feedback.reviewSpaceId(), feedback.sourceMessageId()).stream()
                .findFirst().orElseThrow(() -> new IllegalStateException("评审反馈去重后无法读取既有记录"));
    }

    public List<ReviewFeedback> findPendingBySourceSessionId(String sourceSessionId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM claude_chat_review_feedback "
                        + "WHERE source_session_id = ? AND status = 'PENDING' ORDER BY created_at DESC",
                ROW, sourceSessionId);
    }

    public boolean existsBySourceMessageIdPrefix(String reviewSpaceId, String sourceMessageIdPrefix) {
        Boolean exists = jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM claude_chat_review_feedback "
                        + "WHERE review_space_id = ? AND source_message_id LIKE ?)",
                Boolean.class, reviewSpaceId, sourceMessageIdPrefix + "%");
        return Boolean.TRUE.equals(exists);
    }

    public Optional<String> findLatestSourceMessageIdByPrefix(String reviewSpaceId, String sourceMessageIdPrefix) {
        return jdbc.queryForList("""
                SELECT source_message_id
                  FROM claude_chat_review_feedback
                 WHERE review_space_id = ? AND source_message_id LIKE ?
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1
                """, String.class, reviewSpaceId, sourceMessageIdPrefix + "%").stream().findFirst();
    }

    public boolean updateStatus(String id, String status, long handledAt) {
        return jdbc.update("UPDATE claude_chat_review_feedback SET status = ?, handled_at = ? "
                        + "WHERE id = ? AND status = 'PENDING'",
                status, handledAt, id) > 0;
    }

    private List<ReviewFeedback> findByMessage(String reviewSpaceId, String sourceMessageId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM claude_chat_review_feedback "
                        + "WHERE review_space_id = ? AND source_message_id = ?",
                ROW, reviewSpaceId, sourceMessageId);
    }
}
