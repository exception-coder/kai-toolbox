package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.ConsultWorkflow;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/** 节点配置与会话冻结快照存储；版本发布仍由现有 Agent 仓储拥有。 */
@Repository
public class ConsultWorkflowRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public ConsultWorkflowRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public Optional<Snapshot> production() {
        return jdbc.query("SELECT v.version, w.workflow_json FROM consult_agent_version v "
                        + "JOIN consult_agent_workflow w ON w.agent_id = v.agent_id AND w.version = v.version "
                        + "WHERE v.agent_id = 'business-consult' AND v.status = 'PRODUCTION'",
                (rs, row) -> new Snapshot(rs.getLong("version"), decode(rs.getString("workflow_json"))))
                .stream().findFirst();
    }

    public Optional<Snapshot> session(String sessionId) {
        return jdbc.query("SELECT version, workflow_json FROM consult_session_workflow WHERE session_id = ?",
                (rs, row) -> new Snapshot(rs.getObject("version") == null ? null : rs.getLong("version"),
                        decode(rs.getString("workflow_json"))), sessionId).stream().findFirst();
    }

    public void freeze(String sessionId, Snapshot snapshot) {
        jdbc.update("INSERT INTO consult_session_workflow (session_id, version, workflow_json) VALUES (?, ?, ?)",
                sessionId, snapshot.version(), encode(snapshot.workflow()));
    }

    private String encode(ConsultWorkflow workflow) {
        try {
            return mapper.writeValueAsString(workflow);
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("无法保存流程配置", error);
        }
    }

    private ConsultWorkflow decode(String json) {
        try {
            return mapper.readValue(json, ConsultWorkflow.class);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("流程配置损坏，请检查 Agent 版本", error);
        }
    }

    /** 版本为空表示尚未发布配置时的内置基线。 */
    public record Snapshot(Long version, ConsultWorkflow workflow) { }
}
