package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewRequirement;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/** 持久化计划评审的当前需求清单。 */
@Repository
public class ReviewRequirementRepository {
    private final JdbcTemplate jdbc;

    public ReviewRequirementRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ReviewRequirement> findByReviewSpaceId(String reviewSpaceId) {
        return jdbc.query("""
                SELECT id, review_space_id, source_message_id, title, content,
                       revision, created_at, updated_at
                  FROM claude_chat_review_requirement
                 WHERE review_space_id = ? AND status = 'ACTIVE'
                 ORDER BY created_at, id
                """, (rs, rowNum) -> new ReviewRequirement(
                rs.getString("id"), rs.getString("review_space_id"),
                rs.getString("source_message_id"), rs.getString("title"),
                rs.getString("content"), rs.getLong("revision"),
                rs.getLong("created_at"), rs.getLong("updated_at")), reviewSpaceId);
    }

    /** 同一来源轮次只插入一次，绝不覆盖评审员已经确认的内容。 */
    public void insertMissing(String reviewSpaceId, List<Draft> drafts, long now) {
        if (drafts.isEmpty()) {
            return;
        }
        List<Object[]> rows = drafts.stream()
                .map(draft -> new Object[]{UUID.randomUUID().toString(), reviewSpaceId,
                        draft.sourceMessageId(), draft.title(), draft.content(), now, now})
                .toList();
        jdbc.batchUpdate("""
                INSERT OR IGNORE INTO claude_chat_review_requirement
                  (id, review_space_id, source_message_id, title, content,
                   status, revision, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)
                """, rows);
    }

    public boolean update(String reviewSpaceId, String id, Update update, long now) {
        return jdbc.update("""
                UPDATE claude_chat_review_requirement
                   SET title = ?, content = ?, revision = revision + 1, updated_at = ?
                 WHERE id = ? AND review_space_id = ? AND status = 'ACTIVE' AND revision = ?
                """, update.title(), update.content(), now, id, reviewSpaceId,
                update.expectedRevision()) > 0;
    }

    public boolean remove(String reviewSpaceId, String id, long now) {
        return jdbc.update("""
                UPDATE claude_chat_review_requirement
                   SET status = 'REMOVED', revision = revision + 1, updated_at = ?
                 WHERE id = ? AND review_space_id = ? AND status = 'ACTIVE'
                """, now, id, reviewSpaceId) > 0;
    }

    public void deleteByReviewSpaceId(String reviewSpaceId) {
        jdbc.update("DELETE FROM claude_chat_review_requirement WHERE review_space_id = ?", reviewSpaceId);
    }

    /**
     * 已通过前端结构校验、等待幂等写入的 AI 需求草稿。
     *
     * @param sourceMessageId 来源轮次稳定指纹
     * @param title 需求标题
     * @param content 需求说明
     */
    public record Draft(String sourceMessageId, String title, String content) {
    }

    /** 经过服务层校验的人工修订内容。 */
    public record Update(String title, String content, long expectedRevision) {
    }
}
