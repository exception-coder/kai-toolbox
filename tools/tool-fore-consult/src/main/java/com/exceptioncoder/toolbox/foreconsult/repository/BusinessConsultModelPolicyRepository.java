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
                "SELECT model, display_name, codex_home, updated_at FROM consult_model_policy WHERE policy_id = ?",
                (resultSet, rowNumber) -> new BusinessConsultModelPolicyView(
                        resultSet.getString("model"),
                        resultSet.getString("display_name"),
                        resultSet.getString("codex_home"),
                        resultSet.getLong("updated_at")),
                POLICY_ID).stream().findFirst();
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
