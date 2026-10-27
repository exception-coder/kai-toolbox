package com.exceptioncoder.toolbox.foreconsult.repository;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import static org.assertj.core.api.Assertions.*;

class BusinessConsultPolicyVersionTest {
    @Test
    void failedProbeAuditDoesNotReplaceDefaultOrItsVersion() {
        var jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        jdbc.execute("CREATE TABLE consult_model_policy(policy_id INTEGER PRIMARY KEY, model TEXT, display_name TEXT, codex_home TEXT, updated_at INTEGER)");
        jdbc.execute("CREATE TABLE consult_account_policy_audit(version INTEGER PRIMARY KEY AUTOINCREMENT, operator_id TEXT, previous_home TEXT, target_home TEXT, model TEXT, result_code TEXT, checked_at INTEGER)");
        var repository = new BusinessConsultModelPolicyRepository(jdbc);
        repository.saveValidated("model", "模型", "A", "7", 10);
        long versionA = repository.find().orElseThrow().version();
        repository.audit("7", "A", "B", "model", "AUTHORIZATION_FAILED", 20);
        assertThat(repository.find().orElseThrow().version()).isEqualTo(versionA);
        assertThat(repository.find().orElseThrow().codexHome()).isEqualTo("A");
        repository.saveValidated("model", "模型", "B", "7", 30);
        assertThat(repository.find().orElseThrow().version()).isGreaterThan(versionA);
        assertThat(repository.find().orElseThrow().checkedAt()).isEqualTo(30);
        assertThat(repository.auditTrail()).hasSize(3);
        assertThat(repository.auditTrail().toString()).doesNotContain("token", "password");
    }
}
