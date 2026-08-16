package com.exceptioncoder.toolbox.supplierquote.repository;

import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class ForgeSupplierQuoteStore implements SupplierQuoteStore {
    private final JdbcTemplate jdbc;

    public ForgeSupplierQuoteStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void saveOauthState(String stateHash, String returnTo, long expiresAt, long now) {
        jdbc.update("INSERT INTO supplier_quote_oauth_state(state_hash, return_to, expires_at, created_at) VALUES (?, ?, ?, ?)",
                stateHash, returnTo, expiresAt, now);
    }

    @Override
    public Optional<String> consumeOauthState(String stateHash, long now) {
        Optional<String> returnTo = jdbc.query("""
                SELECT return_to FROM supplier_quote_oauth_state
                WHERE state_hash = ? AND consumed_at IS NULL AND expires_at >= ?
                """, (rs, row) -> rs.getString("return_to"), stateHash, now).stream().findFirst();
        if (returnTo.isEmpty()) {
            return Optional.empty();
        }
        int updated = jdbc.update("""
                UPDATE supplier_quote_oauth_state SET consumed_at = ?
                WHERE state_hash = ? AND consumed_at IS NULL AND expires_at >= ?
                """, now, stateHash, now);
        return updated == 1 ? returnTo : Optional.empty();
    }

    @Override
    public void saveSession(String tokenHash, String subjectHash, long expiresAt, long now) {
        jdbc.update("""
                INSERT INTO supplier_quote_wechat_session(token_hash, wechat_subject_hash, expires_at, created_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?)
                """, tokenHash, subjectHash, expiresAt, now, now);
    }

    @Override
    public Optional<WechatSessionRecord> findSession(String tokenHash, long now) {
        Optional<WechatSessionRecord> row = jdbc.query("""
                SELECT wechat_subject_hash, expires_at FROM supplier_quote_wechat_session
                WHERE token_hash = ? AND expires_at >= ?
                """, (rs, index) -> new WechatSessionRecord(rs.getString("wechat_subject_hash"), rs.getLong("expires_at")),
                tokenHash, now).stream().findFirst();
        row.ifPresent(ignored -> jdbc.update(
                "UPDATE supplier_quote_wechat_session SET last_seen_at = ? WHERE token_hash = ?", now, tokenHash));
        return row;
    }

    @Override
    public Optional<BindingView> findBindingBySubject(String subjectHash) {
        return jdbc.query("""
                SELECT scm_user_id, scm_username, display_name, supplier_id, supplier_name
                FROM supplier_quote_scm_binding WHERE wechat_subject_hash = ? AND active = 1
                """, BINDING_ROW, subjectHash).stream().findFirst();
    }

    @Override
    public Optional<BindingSubjectRecord> findBindingByScmUser(String scmUserId) {
        return jdbc.query("""
                SELECT wechat_subject_hash, scm_user_id FROM supplier_quote_scm_binding
                WHERE scm_user_id = ? AND active = 1
                """, (rs, index) -> new BindingSubjectRecord(rs.getString("wechat_subject_hash"),
                        rs.getString("scm_user_id")), scmUserId).stream().findFirst();
    }

    @Override
    public BindingView insertBinding(String subjectHash, BindingView binding, long now) {
        jdbc.update("""
                INSERT INTO supplier_quote_scm_binding
                  (wechat_subject_hash, scm_user_id, scm_username, display_name, supplier_id, supplier_name,
                   active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
                """, subjectHash, binding.scmUserId(), binding.username(), binding.displayName(),
                binding.supplierId(), binding.supplierName(), now, now);
        return binding;
    }

    public Optional<DraftRow> findDraft(String ticket, String scmUserId) {
        return jdbc.query("""
                SELECT payload_json, draft_version, saved_at FROM supplier_quote_draft
                WHERE quote_ticket = ? AND scm_user_id = ?
                """, (rs, index) -> new DraftRow(rs.getString("payload_json"), rs.getInt("draft_version"),
                        rs.getLong("saved_at")), ticket, scmUserId).stream().findFirst();
    }

    public DraftRow saveDraft(String ticket, String scmUserId, String payloadJson, int expectedVersion, long now) {
        Optional<DraftRow> existing = findDraft(ticket, scmUserId);
        if (existing.isPresent() && existing.get().draftVersion() != expectedVersion) return null;
        if (existing.isEmpty() && expectedVersion != 0) return null;
        int version = expectedVersion + 1;
        jdbc.update("""
                INSERT INTO supplier_quote_draft(quote_ticket, scm_user_id, payload_json, draft_version, saved_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(quote_ticket, scm_user_id) DO UPDATE SET
                  payload_json = excluded.payload_json, draft_version = excluded.draft_version, saved_at = excluded.saved_at
                """, ticket, scmUserId, payloadJson, version, now);
        return new DraftRow(payloadJson, version, now);
    }

    public Optional<SubmissionRow> findSubmission(String ticket, String scmUserId) {
        return jdbc.query("""
                SELECT idempotency_key, submission_id, payload_json, submitted_at
                FROM supplier_quote_submission WHERE quote_ticket = ? AND scm_user_id = ?
                """, (rs, index) -> new SubmissionRow(rs.getString("idempotency_key"),
                        rs.getString("submission_id"), rs.getString("payload_json"), rs.getLong("submitted_at")),
                ticket, scmUserId).stream().findFirst();
    }

    public SubmissionRow insertSubmission(String ticket, String scmUserId, String idempotencyKey,
                                          String submissionId, String payloadJson, long now) {
        jdbc.update("""
                INSERT INTO supplier_quote_submission
                  (quote_ticket, scm_user_id, idempotency_key, submission_id, payload_json, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """, ticket, scmUserId, idempotencyKey, submissionId, payloadJson, now);
        return new SubmissionRow(idempotencyKey, submissionId, payloadJson, now);
    }

    private static final org.springframework.jdbc.core.RowMapper<BindingView> BINDING_ROW = (rs, index) ->
            new BindingView(rs.getString("scm_user_id"), rs.getString("scm_username"),
                    rs.getString("display_name"), rs.getString("supplier_id"), rs.getString("supplier_name"));

    /** Forge SQLite 报价草稿。 */
    public record DraftRow(String payloadJson, int draftVersion, long savedAt) {}
    /** Forge SQLite 报价提交。 */
    public record SubmissionRow(String idempotencyKey, String submissionId, String payloadJson, long submittedAt) {}
}
