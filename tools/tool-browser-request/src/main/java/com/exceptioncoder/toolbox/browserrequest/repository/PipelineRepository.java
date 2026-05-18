package com.exceptioncoder.toolbox.browserrequest.repository;

import com.exceptioncoder.toolbox.browserrequest.domain.Pipeline;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class PipelineRepository {

    private final JdbcTemplate jdbc;

    private final RowMapper<Pipeline> ROW = (rs, i) -> Pipeline.builder()
            .id(rs.getString("id"))
            .sessionId(rs.getString("session_id"))
            .name(rs.getString("name"))
            .stepsJson(rs.getString("steps_json"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public PipelineRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Pipeline> listBySession(String sessionId) {
        return jdbc.query(
                "SELECT * FROM browser_request_pipeline WHERE session_id = ? ORDER BY updated_at DESC",
                ROW, sessionId);
    }

    public Optional<Pipeline> findById(String id) {
        List<Pipeline> rs = jdbc.query("SELECT * FROM browser_request_pipeline WHERE id = ?", ROW, id);
        return rs.isEmpty() ? Optional.empty() : Optional.of(rs.get(0));
    }

    public void insert(Pipeline p) {
        jdbc.update("""
                INSERT INTO browser_request_pipeline
                  (id, session_id, name, steps_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                p.getId(), p.getSessionId(), p.getName(), p.getStepsJson(),
                p.getCreatedAt(), p.getUpdatedAt());
    }

    public void update(String id, String name, String stepsJson, long now) {
        jdbc.update("""
                UPDATE browser_request_pipeline
                SET name = ?, steps_json = ?, updated_at = ?
                WHERE id = ?
                """, name, stepsJson, now, id);
    }

    public boolean deleteById(String id) {
        return jdbc.update("DELETE FROM browser_request_pipeline WHERE id = ?", id) > 0;
    }

    public int deleteBySession(String sessionId) {
        return jdbc.update("DELETE FROM browser_request_pipeline WHERE session_id = ?", sessionId);
    }
}
