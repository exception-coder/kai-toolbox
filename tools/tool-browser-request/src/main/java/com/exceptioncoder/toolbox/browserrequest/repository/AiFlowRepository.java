package com.exceptioncoder.toolbox.browserrequest.repository;

import com.exceptioncoder.toolbox.browserrequest.domain.AiFlow;
import com.exceptioncoder.toolbox.browserrequest.domain.FlowAction;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** browser_request_ai_flow 表访问。steps 以 JSON 文本存于 steps_json。 */
@Repository
public class AiFlowRepository {

    private static final TypeReference<List<FlowAction>> STEPS_TYPE = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final RowMapper<AiFlow> row;

    public AiFlowRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.row = (rs, i) -> new AiFlow(
                rs.getString("id"),
                rs.getString("session_id"),
                rs.getString("name"),
                rs.getString("instruction"),
                readSteps(rs.getString("steps_json")),
                rs.getLong("created_at"),
                rs.getLong("updated_at")
        );
    }

    public void insert(AiFlow f) {
        jdbc.update("""
                INSERT INTO browser_request_ai_flow
                  (id, session_id, name, instruction, steps_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                f.id(), f.sessionId(), f.name(), f.instruction(),
                writeJson(f.steps()), f.createdAt(), f.updatedAt());
    }

    public Optional<AiFlow> findById(String id) {
        List<AiFlow> rows = jdbc.query("SELECT * FROM browser_request_ai_flow WHERE id = ?", row, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<AiFlow> findBySessionOrderByUpdatedDesc(String sessionId) {
        return jdbc.query(
                "SELECT * FROM browser_request_ai_flow WHERE session_id = ? ORDER BY updated_at DESC",
                row, sessionId);
    }

    public boolean deleteById(String id) {
        return jdbc.update("DELETE FROM browser_request_ai_flow WHERE id = ?", id) > 0;
    }

    public int deleteBySession(String sessionId) {
        return jdbc.update("DELETE FROM browser_request_ai_flow WHERE session_id = ?", sessionId);
    }

    private String writeJson(Object v) {
        if (v == null) return "[]";
        try {
            return objectMapper.writeValueAsString(v);
        } catch (Exception e) {
            return "[]";
        }
    }

    private List<FlowAction> readSteps(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, STEPS_TYPE);
        } catch (Exception e) {
            return List.of();
        }
    }
}
