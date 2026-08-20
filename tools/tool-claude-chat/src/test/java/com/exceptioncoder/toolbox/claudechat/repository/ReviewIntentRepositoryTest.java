package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewIntentAssessment;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ReviewIntentRepositoryTest {
    private ReviewIntentRepository repository;

    @BeforeEach
    void setUp() {
        SingleConnectionDataSource dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("""
                CREATE TABLE claude_chat_review_turn_intent (
                    review_space_id TEXT NOT NULL,
                    review_session_id TEXT NOT NULL,
                    turn_id TEXT NOT NULL,
                    client_message_id TEXT NOT NULL,
                    pre_intent TEXT NOT NULL,
                    final_intent TEXT NOT NULL,
                    classification_status TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    reason TEXT,
                    signals_json TEXT NOT NULL,
                    extracted_title TEXT,
                    extracted_content TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (review_session_id, turn_id)
                )
                """);
        repository = new ReviewIntentRepository(jdbc, new ObjectMapper());
    }

    @Test
    void updatesSameTurnFromPreclassificationToPostValidationAndDeletesWithReview() {
        repository.insert(assessment("UNKNOWN", "MISSING", null, 10));
        repository.insert(assessment("REQUIREMENT", "INFERRED", "隐藏工具调用", 20));

        ReviewIntentAssessment stored = repository.findByTurn("review-1", "turn-1").orElseThrow();
        assertThat(stored.finalIntent()).isEqualTo("REQUIREMENT");
        assertThat(stored.classificationStatus()).isEqualTo("INFERRED");
        assertThat(stored.extractedTitle()).isEqualTo("隐藏工具调用");
        assertThat(stored.signals()).containsExactly("需求结构完整");

        repository.deleteByReviewSpaceId("space-1");
        assertThat(repository.findByReviewSpaceId("space-1")).isEmpty();
    }

    private ReviewIntentAssessment assessment(String finalIntent, String status, String title, long updatedAt) {
        return new ReviewIntentAssessment("space-1", "review-1", "turn-1", "message-1",
                "UNKNOWN", finalIntent, status, 0.85, "测试", List.of("需求结构完整"), title,
                title == null ? null : "### 需求说明\n只展示业务对话", 10, updatedAt);
    }
}
