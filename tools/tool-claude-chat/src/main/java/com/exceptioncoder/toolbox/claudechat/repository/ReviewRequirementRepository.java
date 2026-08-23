package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewRequirement;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 持久化计划评审的当前需求清单。 */
@Repository
public class ReviewRequirementRepository {
    private final JdbcTemplate jdbc;

    public ReviewRequirementRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ReviewRequirement> findByReviewSpaceId(String reviewSpaceId) {
        List<RequirementRow> rows = jdbc.query("""
                SELECT id, review_space_id, source_message_id, title, content,
                       revision, created_at, updated_at
                  FROM claude_chat_review_requirement
                 WHERE review_space_id = ? AND status = 'ACTIVE'
                 ORDER BY created_at, id
                """, (rs, rowNum) -> new RequirementRow(
                rs.getString("id"), rs.getString("review_space_id"),
                rs.getString("source_message_id"), rs.getString("title"),
                rs.getString("content"), rs.getLong("revision"),
                rs.getLong("created_at"), rs.getLong("updated_at")), reviewSpaceId);
        Map<String, List<ReviewRequirement.Source>> sources = findSources(reviewSpaceId);
        return rows.stream().map(row -> new ReviewRequirement(
                row.id(), row.reviewSpaceId(), row.sourceMessageId(), row.title(), row.content(),
                row.revision(), row.createdAt(), row.updatedAt(),
                sources.getOrDefault(row.id(), List.of()))).toList();
    }

    public boolean hasProcessedSource(String reviewSpaceId, String sourceMessageId) {
        Integer processed = jdbc.queryForObject("""
                SELECT CASE WHEN
                    EXISTS(SELECT 1 FROM claude_chat_review_requirement_source
                            WHERE review_space_id = ? AND source_message_id = ?)
                    OR EXISTS(SELECT 1 FROM claude_chat_review_requirement
                              WHERE review_space_id = ? AND source_message_id = ?)
                    THEN 1 ELSE 0 END
                """, Integer.class, reviewSpaceId, sourceMessageId,
                reviewSpaceId, sourceMessageId);
        return processed != null && processed > 0;
    }

    public ReviewRequirement findActiveBySourceMessageId(String reviewSpaceId, String sourceMessageId) {
        List<ReviewRequirement> matches = findByReviewSpaceId(reviewSpaceId).stream()
                .filter(item -> item.sourceMessageId().equals(sourceMessageId))
                .toList();
        return matches.isEmpty() ? null : matches.getFirst();
    }

    public String insertRequirement(String reviewSpaceId, Draft draft, long now) {
        String id = UUID.randomUUID().toString();
        int inserted = jdbc.update("""
                INSERT INTO claude_chat_review_requirement
                  (id, review_space_id, source_message_id, title, content,
                   status, revision, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)
                ON CONFLICT(review_space_id, source_message_id) DO NOTHING
                """, id, reviewSpaceId, draft.sourceMessageId(), draft.title(), draft.content(), now, now);
        if (inserted > 0) {
            return id;
        }
        return jdbc.query("""
                SELECT id
                  FROM claude_chat_review_requirement
                 WHERE review_space_id = ? AND source_message_id = ? AND status = 'ACTIVE'
                """, (rs, rowNum) -> rs.getString("id"), reviewSpaceId, draft.sourceMessageId())
                .stream().findFirst().orElse(null);
    }

    /** AI 只维护尚未被评审员人工保存的第一版需求。 */
    public boolean updateCompiled(String reviewSpaceId, String id, String title, String content, long now) {
        return jdbc.update("""
                UPDATE claude_chat_review_requirement
                   SET title = ?, content = ?, updated_at = ?
                 WHERE id = ? AND review_space_id = ? AND status = 'ACTIVE' AND revision = 1
                """, title, content, now, id, reviewSpaceId) > 0;
    }

    public void insertSource(String reviewSpaceId, String requirementId, Source source, long now) {
        jdbc.update("""
                INSERT OR IGNORE INTO claude_chat_review_requirement_source
                  (id, review_space_id, requirement_id, source_message_id, source_text,
                   analysis_text, operation, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID().toString(), reviewSpaceId, requirementId,
                source.sourceMessageId(), source.sourceText(), source.analysisText(),
                source.operation(), now, now);
    }

    public void moveSources(String reviewSpaceId, String fromRequirementId, String toRequirementId, long now) {
        jdbc.update("""
                UPDATE claude_chat_review_requirement_source
                   SET requirement_id = ?, updated_at = ?
                 WHERE review_space_id = ? AND requirement_id = ?
                """, toRequirementId, now, reviewSpaceId, fromRequirementId);
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
        jdbc.update("DELETE FROM claude_chat_review_requirement_source WHERE review_space_id = ?", reviewSpaceId);
        jdbc.update("DELETE FROM claude_chat_review_requirement WHERE review_space_id = ?", reviewSpaceId);
    }

    private Map<String, List<ReviewRequirement.Source>> findSources(String reviewSpaceId) {
        List<SourceRow> rows = jdbc.query("""
                SELECT requirement_id, source_message_id, source_text, analysis_text,
                       operation, created_at
                  FROM claude_chat_review_requirement_source
                 WHERE review_space_id = ? AND requirement_id IS NOT NULL
                 ORDER BY created_at, id
                """, (rs, rowNum) -> new SourceRow(
                rs.getString("requirement_id"), rs.getString("source_message_id"),
                rs.getString("source_text"), rs.getString("analysis_text"),
                rs.getString("operation"), rs.getLong("created_at")), reviewSpaceId);
        Map<String, List<ReviewRequirement.Source>> grouped = new HashMap<>(Math.max(16, rows.size() * 2));
        for (SourceRow row : rows) {
            grouped.computeIfAbsent(row.requirementId(), ignored -> new java.util.ArrayList<>())
                    .add(new ReviewRequirement.Source(row.sourceMessageId(), row.sourceText(),
                            row.analysisText(), row.operation(), row.createdAt()));
        }
        return grouped;
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

    /** 需求候选进入编译器后的来源证据。 */
    public record Source(String sourceMessageId, String sourceText, String analysisText, String operation) {
    }

    /** 经过服务层校验的人工修订内容。 */
    public record Update(String title, String content, long expectedRevision) {
    }

    private record RequirementRow(String id, String reviewSpaceId, String sourceMessageId,
                                  String title, String content, long revision,
                                  long createdAt, long updatedAt) {
    }

    private record SourceRow(String requirementId, String sourceMessageId, String sourceText,
                             String analysisText, String operation, long createdAt) {
    }
}
