package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewFeedback;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;

/** 评审结论去重和处理状态测试。 */
class ReviewFeedbackRepositoryTest {

    private ReviewFeedbackRepository repository;

    @BeforeEach
    void setUp() {
        SingleConnectionDataSource dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("""
                CREATE TABLE claude_chat_review_feedback (
                    id TEXT PRIMARY KEY,
                    review_space_id TEXT NOT NULL,
                    source_session_id TEXT NOT NULL,
                    review_session_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    source_message_id TEXT,
                    status TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    handled_at INTEGER,
                    UNIQUE (review_space_id, source_message_id)
                )
                """);
        repository = new ReviewFeedbackRepository(jdbc);
    }

    @Test
    void duplicateMessageReturnsExistingFeedback() {
        ReviewFeedback first = feedback("feedback-1", "first");
        ReviewFeedback duplicate = feedback("feedback-2", "duplicate");

        ReviewFeedback inserted = repository.insertOrFind(first);
        ReviewFeedback existing = repository.insertOrFind(duplicate);

        assertThat(inserted.id()).isEqualTo("feedback-1");
        assertThat(existing.id()).isEqualTo("feedback-1");
        assertThat(repository.findPendingBySourceSessionId("source-1")).hasSize(1);
    }

    @Test
    void handledFeedbackLeavesPendingList() {
        repository.insertOrFind(feedback("feedback-1", "content"));

        boolean changed = repository.updateStatus("feedback-1", "CONSUMED", 200L);

        assertThat(changed).isTrue();
        assertThat(repository.findPendingBySourceSessionId("source-1")).isEmpty();
        assertThat(repository.updateStatus("feedback-1", "DISMISSED", 300L)).isFalse();
    }

    private static ReviewFeedback feedback(String id, String content) {
        return new ReviewFeedback(id, "space-1", "source-1", "review-1", content,
                "message-1", "PENDING", 100L, null);
    }
}
