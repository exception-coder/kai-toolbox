package com.exceptioncoder.toolbox.claudechat.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/** 持久化成功评审汇总已经覆盖的 AI 消息指纹。 */
@Repository
public class ReviewSummaryCoverageRepository {
    private final JdbcTemplate jdbc;

    public ReviewSummaryCoverageRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 幂等登记一次成功汇总覆盖的消息集合。 */
    public void insertAll(String reviewSpaceId, String summaryFeedbackId,
                          List<String> sourceMessageIds, long now) {
        if (sourceMessageIds.isEmpty()) {
            return;
        }
        List<Object[]> rows = sourceMessageIds.stream()
                .map(sourceMessageId -> new Object[]{UUID.randomUUID().toString(), reviewSpaceId,
                        sourceMessageId, summaryFeedbackId, now, now})
                .toList();
        jdbc.batchUpdate("""
                INSERT OR IGNORE INTO claude_chat_review_summary_coverage
                  (id, review_space_id, source_message_id, summary_feedback_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """, rows);
    }

    public List<String> findSourceMessageIds(String reviewSpaceId) {
        return jdbc.queryForList("""
                SELECT source_message_id
                  FROM claude_chat_review_summary_coverage
                 WHERE review_space_id = ?
                 ORDER BY created_at, source_message_id
                """, String.class, reviewSpaceId);
    }
}
