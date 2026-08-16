package com.exceptioncoder.toolbox.claudechat.repository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ReviewSummaryCoverageRepositoryTest {
    private ReviewSummaryCoverageRepository repository;

    @BeforeEach
    void setUp() {
        SingleConnectionDataSource dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("""
                CREATE TABLE claude_chat_review_summary_coverage (
                    id TEXT PRIMARY KEY,
                    review_space_id TEXT NOT NULL,
                    source_message_id TEXT NOT NULL,
                    summary_feedback_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    UNIQUE (review_space_id, source_message_id)
                )
                """);
        repository = new ReviewSummaryCoverageRepository(jdbc);
    }

    @Test
    void persistsCoverageIdempotentlyAndKeepsReviewSpacesIsolated() {
        repository.insertAll("space-1", "feedback-1", List.of("message-a", "message-b"), 100L);
        repository.insertAll("space-1", "feedback-2", List.of("message-a"), 200L);
        repository.insertAll("space-2", "feedback-3", List.of("message-a"), 300L);

        assertThat(repository.findSourceMessageIds("space-1"))
                .containsExactly("message-a", "message-b");
        assertThat(repository.findSourceMessageIds("space-2"))
                .containsExactly("message-a");
    }
}
