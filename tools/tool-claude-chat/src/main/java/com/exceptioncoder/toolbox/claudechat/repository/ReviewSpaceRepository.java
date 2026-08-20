package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewSpace;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class ReviewSpaceRepository {
    private static final RowMapper<ReviewSpace> ROW = (rs, i) -> new ReviewSpace(
            rs.getString("id"), rs.getString("source_session_id"), rs.getString("review_session_id"),
            rs.getString("mode"), rs.getString("token_hash"), rs.getString("token_ciphertext"), rs.getString("status"),
            rs.getString("title"), rs.getString("context_snapshot"), rs.getLong("expires_at"),
            rs.getLong("created_at"), rs.getLong("updated_at"));

    private final JdbcTemplate jdbc;

    public ReviewSpaceRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(ReviewSpace space) {
        jdbc.update("""
                INSERT INTO claude_chat_review_space
                  (id, source_session_id, review_session_id, mode, token_hash, token_ciphertext, status, title,
                   context_snapshot, expires_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, space.id(), space.sourceSessionId(), space.reviewSessionId(), space.mode(),
                space.tokenHash(), space.tokenCiphertext(), space.status(), space.title(), space.contextSnapshot(), space.expiresAt(),
                space.createdAt(), space.updatedAt());
    }

    public List<ReviewSpace> findBySourceSessionId(String sourceSessionId) {
        return jdbc.query("SELECT * FROM claude_chat_review_space WHERE source_session_id = ? ORDER BY created_at DESC",
                ROW, sourceSessionId);
    }

    public Optional<ReviewSpace> findById(String id) {
        return jdbc.query("SELECT * FROM claude_chat_review_space WHERE id = ?", ROW, id).stream().findFirst();
    }

    public Optional<ReviewSpace> findByTokenHash(String tokenHash) {
        return jdbc.query("SELECT * FROM claude_chat_review_space WHERE token_hash = ?", ROW, tokenHash)
                .stream().findFirst();
    }

    public Optional<ReviewSpace> findByReviewSessionId(String reviewSessionId) {
        return jdbc.query("SELECT * FROM claude_chat_review_space WHERE review_session_id = ?", ROW, reviewSessionId)
                .stream().findFirst();
    }

    public boolean revoke(String id, long now) {
        return jdbc.update("UPDATE claude_chat_review_space SET status = 'REVOKED', updated_at = ? WHERE id = ? AND status = 'ACTIVE'",
                now, id) > 0;
    }

    public boolean reissueToken(String id, String expectedTokenHash, String tokenHash,
                                String tokenCiphertext, long expiresAt, long now) {
        return jdbc.update("""
                UPDATE claude_chat_review_space
                SET token_hash = ?, token_ciphertext = ?, expires_at = ?, updated_at = ?
                WHERE id = ? AND token_hash = ? AND status = 'ACTIVE'
                """, tokenHash, tokenCiphertext, expiresAt, now, id, expectedTokenHash) > 0;
    }

    /** 仅当公开令牌仍匹配时补写或修复密文，避免与令牌轮换发生竞态。 */
    public boolean storeTokenCiphertext(String id, String expectedTokenHash, String tokenCiphertext, long now) {
        return jdbc.update("""
                UPDATE claude_chat_review_space
                SET token_ciphertext = ?, updated_at = ?
                WHERE id = ? AND token_hash = ?
                """, tokenCiphertext, now, id, expectedTokenHash) > 0;
    }

    /** 永久删除评审聚合内的数据；调用方负责提供事务边界。 */
    public void deleteAggregate(String id) {
        jdbc.update("DELETE FROM claude_chat_review_summary_coverage WHERE review_space_id = ?", id);
        jdbc.update("DELETE FROM claude_chat_review_feedback WHERE review_space_id = ?", id);
        jdbc.update("DELETE FROM claude_chat_review_space WHERE id = ?", id);
    }
}
