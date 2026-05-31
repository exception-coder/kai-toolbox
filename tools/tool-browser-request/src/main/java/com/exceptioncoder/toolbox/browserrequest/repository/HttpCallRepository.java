package com.exceptioncoder.toolbox.browserrequest.repository;

import com.exceptioncoder.toolbox.browserrequest.domain.HttpCall;
import com.exceptioncoder.toolbox.browserrequest.domain.enums.ResourceType;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** browser_request_http_call 表的访问。headers 字段以 JSON 文本存。 */
@Repository
public class HttpCallRepository {

    private static final TypeReference<Map<String, String>> MAP_TYPE = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final RowMapper<HttpCall> row;

    public HttpCallRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.row = (rs, i) -> new HttpCall(
                rs.getString("id"),
                rs.getString("recording_id"),
                rs.getInt("seq"),
                rs.getString("method"),
                rs.getString("url"),
                ResourceType.valueOf(rs.getString("resource_type")),
                parseHeaders(rs.getString("request_headers")),
                rs.getString("request_body"),
                rs.getObject("status") != null ? rs.getInt("status") : null,
                parseHeaders(rs.getString("response_headers")),
                rs.getString("response_body"),
                rs.getInt("response_truncated") == 1,
                rs.getInt("sensitive") == 1,
                rs.getLong("started_at"),
                rs.getObject("elapsed_ms") != null ? rs.getInt("elapsed_ms") : null,
                rs.getString("initiator")
        );
    }

    public void insert(HttpCall c) {
        jdbc.update("""
                INSERT INTO browser_request_http_call
                  (id, recording_id, seq, method, url, resource_type,
                   request_headers, request_body, status,
                   response_headers, response_body, response_truncated, sensitive,
                   started_at, elapsed_ms, initiator)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                c.id(), c.recordingId(), c.seq(), c.method(), c.url(), c.resourceType().name(),
                writeHeaders(c.requestHeaders()), c.requestBody(), c.status(),
                writeHeaders(c.responseHeaders()), c.responseBody(),
                c.responseTruncated() ? 1 : 0,
                c.sensitive() ? 1 : 0,
                c.startedAt(), c.elapsedMs(), c.initiator());
    }

    public List<HttpCall> findByRecording(String recordingId, int offset, int limit) {
        return jdbc.query(
                "SELECT * FROM browser_request_http_call WHERE recording_id = ? ORDER BY seq ASC LIMIT ? OFFSET ?",
                row, recordingId, limit, offset);
    }

    public int countByRecording(String recordingId) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM browser_request_http_call WHERE recording_id = ?",
                Integer.class, recordingId);
        return n == null ? 0 : n;
    }

    public List<HttpCall> findByIds(List<String> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        return jdbc.query(
                "SELECT * FROM browser_request_http_call WHERE id IN (" + placeholders + ")",
                row, ids.toArray());
    }

    public int deleteByRecording(String recordingId) {
        return jdbc.update("DELETE FROM browser_request_http_call WHERE recording_id = ?", recordingId);
    }

    private String writeHeaders(Map<String, String> h) {
        if (h == null || h.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(h);
        } catch (Exception e) {
            return null;
        }
    }

    private Map<String, String> parseHeaders(String json) {
        if (json == null || json.isBlank()) return new HashMap<>();
        try {
            return objectMapper.readValue(json, MAP_TYPE);
        } catch (Exception e) {
            return new HashMap<>();
        }
    }
}
