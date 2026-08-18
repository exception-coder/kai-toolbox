package com.regentech_fashion.supplierquote.infrastructure.local;

import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Optional;
import java.util.List;
import java.util.function.Supplier;

public class JdbcLocalSupplierQuoteStore implements LocalSupplierQuotePersistence {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactionTemplate;

    public JdbcLocalSupplierQuoteStore(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
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
    public Optional<BindingSubjectRecord> findBindingByAccount(String accountId, String sourceSystem) {
        return jdbc.query("""
                SELECT wechat_subject_hash, scm_user_id FROM supplier_quote_scm_binding
                WHERE scm_user_id = ? AND active = 1
                """, (rs, index) -> new BindingSubjectRecord(rs.getString("wechat_subject_hash"),
                        rs.getString("scm_user_id"), sourceSystem), accountId).stream().findFirst();
    }

    @Override
    public BindingView insertBinding(String subjectHash, BindingView binding, long now) {
        jdbc.update("""
                INSERT INTO supplier_quote_scm_binding
                  (wechat_subject_hash, scm_user_id, scm_username, display_name, supplier_id, supplier_name,
                   active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
                """, subjectHash, binding.accountId(), binding.username(), binding.displayName(),
                binding.supplierId(), binding.supplierName(), now, now);
        return binding;
    }

    @Override
    public void saveSubscriptionGrant(String subjectHash, String openid, String templateId, int scene, long now) {
        jdbc.update("""
                INSERT INTO supplier_quote_wechat_subscription
                  (wechat_subject_hash, openid, template_id, scene, status, created_at)
                VALUES (?, ?, ?, ?, 'AVAILABLE', ?)
                """, subjectHash, openid, templateId, scene, now);
    }

    @Override
    public List<SubscriptionGrantRecord> findSubscriptionGrants() {
        return jdbc.query("""
                SELECT s.id, s.wechat_subject_hash, s.openid, s.template_id, s.scene, s.status,
                       s.created_at, s.sent_at, s.result_code, s.result_message,
                       b.scm_user_id, b.display_name, b.supplier_name,
                       (SELECT COUNT(*) FROM supplier_quote_wechat_subscription_attempt a
                        WHERE a.subscription_id = s.id) AS attempt_count
                FROM supplier_quote_wechat_subscription s
                LEFT JOIN supplier_quote_scm_binding b
                  ON b.wechat_subject_hash = s.wechat_subject_hash AND b.active = 1
                ORDER BY CASE s.status WHEN 'AVAILABLE' THEN 0 WHEN 'SENDING' THEN 1 ELSE 2 END,
                         s.created_at DESC
                """, (rs, index) -> new SubscriptionGrantRecord(
                rs.getLong("id"), rs.getString("wechat_subject_hash"), rs.getString("openid"),
                rs.getString("template_id"), rs.getInt("scene"), rs.getString("status"),
                rs.getLong("created_at"), nullableLong(rs, "sent_at"), rs.getString("result_code"),
                rs.getString("result_message"), rs.getString("scm_user_id"), rs.getString("display_name"),
                rs.getString("supplier_name"), rs.getInt("attempt_count")));
    }

    @Override
    public boolean hasUsableSubscriptionGrant(String subjectHash) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM supplier_quote_wechat_subscription
                WHERE wechat_subject_hash = ? AND status IN ('AVAILABLE', 'FAILED')
                """, Integer.class, subjectHash);
        return count != null && count > 0;
    }

    @Override
    public boolean claimSubscriptionGrant(long grantId, long now) {
        return jdbc.update("""
                UPDATE supplier_quote_wechat_subscription
                SET status = 'SENDING', claimed_at = ?
                WHERE id = ? AND status IN ('AVAILABLE', 'FAILED')
                """, now, grantId) == 1;
    }

    @Override
    public void completeSubscriptionGrant(long grantId, boolean sent, String resultCode,
                                          String resultMessage, long now) {
        transactionTemplate.executeWithoutResult(status -> {
            jdbc.update("""
                    INSERT INTO supplier_quote_wechat_subscription_attempt
                      (subscription_id, successful, result_code, result_message, attempted_at)
                    VALUES (?, ?, ?, ?, ?)
                    """, grantId, sent ? 1 : 0, resultCode, resultMessage, now);
            jdbc.update("""
                    UPDATE supplier_quote_wechat_subscription
                    SET status = ?, sent_at = ?, result_code = ?, result_message = ?
                    WHERE id = ? AND status = 'SENDING'
                    """, sent ? "SENT" : "FAILED", sent ? now : null, resultCode, resultMessage, grantId);
        });
    }

    @Override
    public Optional<DraftRow> findDraft(String ticket, String accountId) {
        return jdbc.query("""
                SELECT payload_json, draft_version, saved_at FROM supplier_quote_draft
                WHERE quote_ticket = ? AND scm_user_id = ?
                """, (rs, index) -> new DraftRow(rs.getString("payload_json"), rs.getInt("draft_version"),
                        rs.getLong("saved_at")), ticket, accountId).stream().findFirst();
    }

    @Override
    public DraftRow saveDraft(String ticket, String accountId, String payloadJson, int expectedVersion, long now) {
        Optional<DraftRow> existing = findDraft(ticket, accountId);
        if (existing.isPresent() && existing.get().draftVersion() != expectedVersion) return null;
        if (existing.isEmpty() && expectedVersion != 0) return null;
        int version = expectedVersion + 1;
        jdbc.update("""
                INSERT INTO supplier_quote_draft(quote_ticket, scm_user_id, payload_json, draft_version, saved_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(quote_ticket, scm_user_id) DO UPDATE SET
                  payload_json = excluded.payload_json, draft_version = excluded.draft_version, saved_at = excluded.saved_at
                """, ticket, accountId, payloadJson, version, now);
        return new DraftRow(payloadJson, version, now);
    }

    @Override
    public Optional<SubmissionRow> findSubmission(String ticket, String accountId) {
        return jdbc.query("""
                SELECT idempotency_key, submission_id, payload_json, submitted_at
                FROM supplier_quote_submission WHERE quote_ticket = ? AND scm_user_id = ?
                """, (rs, index) -> new SubmissionRow(rs.getString("idempotency_key"),
                        rs.getString("submission_id"), rs.getString("payload_json"), rs.getLong("submitted_at")),
                ticket, accountId).stream().findFirst();
    }

    @Override
    public SubmissionRow insertSubmission(String ticket, String accountId, String idempotencyKey,
                                          String submissionId, String payloadJson, long now) {
        jdbc.update("""
                INSERT INTO supplier_quote_submission
                  (quote_ticket, scm_user_id, idempotency_key, submission_id, payload_json, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """, ticket, accountId, idempotencyKey, submissionId, payloadJson, now);
        return new SubmissionRow(idempotencyKey, submissionId, payloadJson, now);
    }

    private static final org.springframework.jdbc.core.RowMapper<BindingView> BINDING_ROW = (rs, index) ->
            new BindingView(rs.getString("scm_user_id"), rs.getString("scm_username"),
                    rs.getString("display_name"), rs.getString("supplier_id"), rs.getString("supplier_name"), "SCM");

    @Override
    public <T> T inTransaction(Supplier<T> action) {
        return transactionTemplate.execute(status -> action.get());
    }

    private static Long nullableLong(java.sql.ResultSet resultSet, String column) throws java.sql.SQLException {
        long value = resultSet.getLong(column);
        return resultSet.wasNull() ? null : value;
    }
}
