package com.exceptioncoder.toolbox.browserrequest.repository;

import com.exceptioncoder.toolbox.browserrequest.domain.SavedRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class SavedRequestRepository {

    private final JdbcTemplate jdbc;

    private final RowMapper<SavedRequest> ROW = (rs, i) -> SavedRequest.builder()
            .id(rs.getString("id"))
            .sessionId(rs.getString("session_id"))
            .name(rs.getString("name"))
            .curl(rs.getString("curl"))
            .method(rs.getString("method"))
            .url(rs.getString("url"))
            .headersJson(rs.getString("headers"))
            .body(rs.getString("body"))
            .outputsJson(rs.getString("outputs_json"))
            .lastResponseBody(rs.getString("last_response_body"))
            .lastResponseAt(rs.getObject("last_response_at") != null ? rs.getLong("last_response_at") : null)
            .lastExtractedValuesJson(rs.getString("last_extracted_values_json"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public SavedRequestRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(SavedRequest r) {
        jdbc.update("""
                INSERT INTO browser_request_saved
                  (id, session_id, name, curl, method, url, headers, body, outputs_json,
                   last_response_body, last_response_at, last_extracted_values_json,
                   created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                r.getId(), r.getSessionId(), r.getName(),
                r.getCurl(), r.getMethod(), r.getUrl(),
                r.getHeadersJson(), r.getBody(), r.getOutputsJson(),
                r.getLastResponseBody(), r.getLastResponseAt(), r.getLastExtractedValuesJson(),
                r.getCreatedAt(), r.getUpdatedAt());
    }

    public void update(SavedRequest r) {
        jdbc.update("""
                UPDATE browser_request_saved
                SET name = ?, curl = ?, method = ?, url = ?, headers = ?, body = ?,
                    outputs_json = ?, last_response_body = ?, last_response_at = ?,
                    last_extracted_values_json = ?, updated_at = ?
                WHERE id = ?
                """,
                r.getName(), r.getCurl(), r.getMethod(), r.getUrl(),
                r.getHeadersJson(), r.getBody(), r.getOutputsJson(),
                r.getLastResponseBody(), r.getLastResponseAt(), r.getLastExtractedValuesJson(),
                r.getUpdatedAt(),
                r.getId());
    }

    public Optional<SavedRequest> findById(String id) {
        List<SavedRequest> rows = jdbc.query(
                "SELECT * FROM browser_request_saved WHERE id = ?", ROW, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<SavedRequest> findBySession(String sessionId) {
        return jdbc.query(
                "SELECT * FROM browser_request_saved WHERE session_id = ? ORDER BY updated_at DESC",
                ROW, sessionId);
    }

    public boolean deleteById(String id) {
        return jdbc.update("DELETE FROM browser_request_saved WHERE id = ?", id) > 0;
    }

    public int deleteBySession(String sessionId) {
        return jdbc.update("DELETE FROM browser_request_saved WHERE session_id = ?", sessionId);
    }
}
