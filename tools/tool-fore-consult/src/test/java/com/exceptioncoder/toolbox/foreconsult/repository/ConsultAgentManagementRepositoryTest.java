package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.AgentVersion;
import com.exceptioncoder.toolbox.foreconsult.service.CreateAgentVersionCommand;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ConsultAgentManagementRepositoryTest {

    private ConsultAgentManagementRepository repository;
    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        SingleConnectionDataSource dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("CREATE TABLE consult_agent_definition (agent_id TEXT PRIMARY KEY, name TEXT NOT NULL, "
                + "owner TEXT NOT NULL, description TEXT NOT NULL, endpoint TEXT NOT NULL, framework TEXT NOT NULL, "
                + "observability_url TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
        jdbc.execute("CREATE TABLE consult_agent_version (agent_id TEXT NOT NULL, version INTEGER NOT NULL, "
                + "status TEXT NOT NULL, model TEXT NOT NULL, temperature REAL NOT NULL, prompt_ref TEXT NOT NULL, "
                + "orchestration_version TEXT NOT NULL, tools_json TEXT NOT NULL, mcp_servers_json TEXT NOT NULL, "
                + "skills_json TEXT NOT NULL, evaluation_run_id TEXT, evaluation_score REAL, "
                + "evaluation_passed INTEGER NOT NULL, created_at INTEGER NOT NULL, released_at INTEGER, "
                + "PRIMARY KEY (agent_id, version))");
        jdbc.execute("CREATE TABLE consult_agent_release (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, "
                + "action TEXT NOT NULL, from_version INTEGER, to_version INTEGER NOT NULL, released_at INTEGER NOT NULL)");
        jdbc.update("INSERT INTO consult_agent_definition VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                "business-consult", "业务咨询 Agent", "Forge", "只读咨询", "/api/fore-consult/sessions",
                "Java", null, 0, 0);
        jdbc.update("INSERT INTO consult_agent_version VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                "business-consult", 1, "PRODUCTION", "runtime-default", 0.1, "fore-consult-v4", "v4",
                "[]", "[]", "[]", null, null, 0, 0, 0);
        repository = new ConsultAgentManagementRepository(jdbc, new ObjectMapper());
    }

    @Test
    void replacesCandidateAndPromotesItAtomically() {
        AgentVersion firstCandidate = repository.replaceCandidate(command("eval-1", 98.2), 100);
        AgentVersion secondCandidate = repository.replaceCandidate(command("eval-2", 99.1), 200);

        assertThat(firstCandidate.version()).isEqualTo(2);
        assertThat(secondCandidate.version()).isEqualTo(3);
        assertThat(repository.findVersion(2).orElseThrow().status()).isEqualTo("HISTORICAL");

        repository.promote(3, "RELEASE", 300);

        assertThat(repository.findVersion(1).orElseThrow().status()).isEqualTo("HISTORICAL");
        assertThat(repository.findVersion(3).orElseThrow().status()).isEqualTo("PRODUCTION");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM consult_agent_release", Integer.class)).isEqualTo(1);
    }

    private CreateAgentVersionCommand command(String runId, double score) {
        return new CreateAgentVersionCommand(
                "gpt-5.6",
                0.1,
                "fore-consult-v4",
                "v4",
                List.of("source_read"),
                List.of("consult-readonly"),
                List.of("backend-evidence"),
                runId,
                score,
                true);
    }
}

