package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingConfig;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingRun;
import com.exceptioncoder.toolbox.foreconsult.infrastructure.teaching.AgentScopeTeachingExecutor;
import com.exceptioncoder.toolbox.foreconsult.service.TeachingAgentConfigurationService;
import com.exceptioncoder.toolbox.foreconsult.service.TeachingAgentRunService;
import com.exceptioncoder.toolbox.llm.config.LlmGatewayProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import static org.assertj.core.api.Assertions.assertThat;

/** 使用真实模块 DDL 和 SQLite，验证版本扩展与评测证据读写。 */
class TeachingAgentRepositoryTest {
    @Test
    void schemaIsIdempotentAndVersionedEvidenceRoundTrips() throws Exception {
        try (var source = new SingleConnectionDataSource("jdbc:sqlite::memory:", true)) {
            JdbcTemplate jdbc = new JdbcTemplate(source);
            String fullSchema = new ClassPathResource("db/fore-consult-schema.sql")
                    .getContentAsString(StandardCharsets.UTF_8);
            String schema = fullSchema.substring(fullSchema.indexOf("CREATE TABLE IF NOT EXISTS consult_agent_definition"));
            for (int pass = 0; pass < 2; pass++) {
                for (String statement : schema.split(";")) {
                    if (!statement.isBlank()) {
                        jdbc.execute(statement);
                    }
                }
            }
            var mapper = new ObjectMapper();
            var registry = new ConsultAgentManagementRepository(jdbc, mapper);
            var repository = new TeachingAgentRepository(jdbc, mapper);
            var configurations = new TeachingAgentConfigurationService(registry, repository);
            assertThat(registry.findDefinition(TeachingConfig.AGENT_ID).framework()).contains("AgentScope");
            assertThat(configurations.config(1)).isEqualTo(TeachingConfig.defaults());
            long version = configurations.save(TeachingConfig.defaults());
            assertThat(version).isEqualTo(2);
            assertThat(configurations.config(version)).isEqualTo(TeachingConfig.defaults());
            assertThat(registry.findVersion(TeachingConfig.AGENT_ID, 1).orElseThrow().status()).isEqualTo("HISTORICAL");
            var run = new TeachingRun("test-run", version, "DEMO", "input", "FAILED", "retry", null,
                    List.of(), 10L, null, 100L);
            repository.saveRun(run);
            assertThat(repository.runs()).containsExactly(run);
            var service = new TeachingAgentRunService(configurations, repository,
                    new AgentScopeTeachingExecutor(new LlmGatewayProperties()));
            var result = service.evaluate(version, "DEMO");
            assertThat(result.score()).isEqualTo(100);
            assertThat(result.cases()).hasSize(5);
            assertThat(repository.evaluations()).containsExactly(result);
            var small = new TeachingConfig("test", 0.1, TeachingConfig.defaults().prompt(), 50, 6, 30, 0, 1024, true);
            long changedVersion = configurations.save(small);
            var changed = service.evaluate(changedVersion, "DEMO");
            assertThat(changed.passed()).isFalse();
            assertThat(changed.cases()).anyMatch(item -> !item.differences().isEmpty());
        }
    }
}
