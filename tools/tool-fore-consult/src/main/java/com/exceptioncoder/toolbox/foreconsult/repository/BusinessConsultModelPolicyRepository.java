package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.api.dto.BusinessConsultModelPolicyView;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/** Persists the single administrator-owned business consultation runtime policy. */
@Repository
public class BusinessConsultModelPolicyRepository {

    private static final int POLICY_ID = 1;

    private final JdbcTemplate jdbc;

    public BusinessConsultModelPolicyRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Returns the current policy when configured. */
    public Optional<BusinessConsultModelPolicyView> find() {
        return jdbc.query(
                """
                SELECT p.model, p.display_name, p.codex_home, p.updated_at,
                       a.version, a.result_code, a.checked_at
                FROM consult_model_policy p LEFT JOIN consult_account_policy_audit a
                  ON a.version = (SELECT MAX(version) FROM consult_account_policy_audit WHERE result_code = 'VALID')
                WHERE p.policy_id = ?
                """,
                (resultSet, rowNumber) -> new BusinessConsultModelPolicyView(
                        resultSet.getString("model"),
                        resultSet.getString("display_name"),
                        resultSet.getString("codex_home"),
                        resultSet.getLong("updated_at"), resultSet.getLong("version"),
                        resultSet.getString("result_code"), resultSet.getObject("checked_at") == null ? null : resultSet.getLong("checked_at")),
                POLICY_ID).stream().findFirst();
    }

    @org.springframework.transaction.annotation.Transactional
    public void saveValidated(String model, String displayName, String codexHome, String operator, long checkedAt) {
        String previous = find().map(BusinessConsultModelPolicyView::codexHome).orElse(null);
        save(model, displayName, codexHome, checkedAt);
        audit(operator, previous, codexHome, model, "VALID", checkedAt);
    }

    public void audit(String operator, String previous, String target, String model, String result, long checkedAt) {
        jdbc.update("""
                INSERT INTO consult_account_policy_audit
                  (operator_id, previous_home, target_home, model, result_code, checked_at) VALUES (?, ?, ?, ?, ?, ?)
                """, operator, previous, target, model, result, checkedAt);
    }

    public java.util.List<java.util.Map<String, Object>> auditTrail() {
        return jdbc.queryForList("""
                SELECT version, operator_id, previous_home, target_home, model, result_code, checked_at
                FROM consult_account_policy_audit ORDER BY version DESC LIMIT 50
                """);
    }

    /** Replaces the singleton policy atomically. */
    public void save(String model, String displayName, String codexHome, long updatedAt) {
        jdbc.update("""
                INSERT INTO consult_model_policy (policy_id, model, display_name, codex_home, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(policy_id) DO UPDATE SET
                    model = excluded.model,
                    display_name = excluded.display_name,
                    codex_home = excluded.codex_home,
                    updated_at = excluded.updated_at
                """, POLICY_ID, model, displayName, codexHome, updatedAt);
    }
}
