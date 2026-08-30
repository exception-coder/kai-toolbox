package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.AgentVersion;
import com.exceptioncoder.toolbox.foreconsult.service.CreateAgentVersionCommand;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

/**
 * 业务咨询 Agent 定义、版本快照和发布记录的 SQLite 适配器。
 */
@Repository
public class ConsultAgentManagementRepository {

    /** 当前模块唯一受治理的 Agent。 */
    public static final String AGENT_ID = "business-consult";

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final RowMapper<AgentVersion> versionRowMapper = this::mapVersion;

    public ConsultAgentManagementRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public AgentDefinition findDefinition() {
        return jdbc.queryForObject(
                "SELECT agent_id, name, owner, description, endpoint, framework, observability_url "
                        + "FROM consult_agent_definition WHERE agent_id = ?",
                (rs, rowNum) -> new AgentDefinition(
                        rs.getString("agent_id"),
                        rs.getString("name"),
                        rs.getString("owner"),
                        rs.getString("description"),
                        rs.getString("endpoint"),
                        rs.getString("framework"),
                        rs.getString("observability_url")),
                AGENT_ID);
    }

    public List<AgentVersion> findVersions() {
        return jdbc.query(
                "SELECT version, status, model, temperature, prompt_ref, orchestration_version, tools_json, "
                        + "mcp_servers_json, skills_json, evaluation_run_id, evaluation_score, evaluation_passed, "
                        + "created_at, released_at FROM consult_agent_version WHERE agent_id = ? "
                        + "ORDER BY version DESC",
                versionRowMapper,
                AGENT_ID);
    }

    public Optional<AgentVersion> findVersion(long version) {
        List<AgentVersion> matches = jdbc.query(
                "SELECT version, status, model, temperature, prompt_ref, orchestration_version, tools_json, "
                        + "mcp_servers_json, skills_json, evaluation_run_id, evaluation_score, evaluation_passed, "
                        + "created_at, released_at FROM consult_agent_version WHERE agent_id = ? AND version = ?",
                versionRowMapper,
                AGENT_ID,
                version);
        return matches.stream().findFirst();
    }

    public AgentVersion replaceCandidate(CreateAgentVersionCommand command, long now) {
        jdbc.update(
                "UPDATE consult_agent_version SET status = 'HISTORICAL' "
                        + "WHERE agent_id = ? AND status = 'CANDIDATE'",
                AGENT_ID);
        Long nextVersion = jdbc.queryForObject(
                "SELECT COALESCE(MAX(version), 0) + 1 FROM consult_agent_version WHERE agent_id = ?",
                Long.class,
                AGENT_ID);
        long version = nextVersion == null ? 1L : nextVersion;
        jdbc.update(
                "INSERT INTO consult_agent_version (agent_id, version, status, model, temperature, prompt_ref, "
                        + "orchestration_version, tools_json, mcp_servers_json, skills_json, evaluation_run_id, "
                        + "evaluation_score, evaluation_passed, created_at) "
                        + "VALUES (?, ?, 'CANDIDATE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                AGENT_ID,
                version,
                command.model(),
                command.temperature(),
                command.promptRef(),
                command.orchestrationVersion(),
                writeList(command.tools()),
                writeList(command.mcpServers()),
                writeList(command.skills()),
                command.evaluationRunId(),
                command.evaluationScore(),
                command.evaluationPassed() ? 1 : 0,
                now);
        return findVersion(version).orElseThrow();
    }

    public void promote(long version, String action, long now) {
        Long currentProduction = jdbc.query(
                "SELECT version FROM consult_agent_version WHERE agent_id = ? AND status = 'PRODUCTION'",
                rs -> rs.next() ? rs.getLong(1) : null,
                AGENT_ID);
        jdbc.update(
                "UPDATE consult_agent_version SET status = 'HISTORICAL' "
                        + "WHERE agent_id = ? AND status = 'PRODUCTION'",
                AGENT_ID);
        jdbc.update(
                "UPDATE consult_agent_version SET status = 'PRODUCTION', released_at = ? "
                        + "WHERE agent_id = ? AND version = ?",
                now,
                AGENT_ID,
                version);
        jdbc.update(
                "INSERT INTO consult_agent_release "
                        + "(agent_id, action, from_version, to_version, released_at) VALUES (?, ?, ?, ?, ?)",
                AGENT_ID,
                action,
                currentProduction,
                version,
                now);
    }

    private AgentVersion mapVersion(ResultSet rs, int rowNum) throws SQLException {
        Number score = (Number) rs.getObject("evaluation_score");
        Number releasedAt = (Number) rs.getObject("released_at");
        return new AgentVersion(
                rs.getLong("version"),
                rs.getString("status"),
                rs.getString("model"),
                rs.getDouble("temperature"),
                rs.getString("prompt_ref"),
                rs.getString("orchestration_version"),
                readList(rs.getString("tools_json")),
                readList(rs.getString("mcp_servers_json")),
                readList(rs.getString("skills_json")),
                rs.getString("evaluation_run_id"),
                score == null ? null : score.doubleValue(),
                rs.getInt("evaluation_passed") != 0,
                rs.getLong("created_at"),
                releasedAt == null ? null : releasedAt.longValue());
    }

    private List<String> readList(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<>() { });
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Agent 版本能力清单无法解析", exception);
        }
    }

    private String writeList(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Agent 版本能力清单无法保存", exception);
        }
    }

    /**
     * 固定 Agent Registry 定义。
     */
    public record AgentDefinition(
            String id,
            String name,
            String owner,
            String description,
            String endpoint,
            String framework,
            String observabilityUrl
    ) {
    }
}

