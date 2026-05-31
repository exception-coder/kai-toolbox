package com.exceptioncoder.toolbox.browserrequest.repository;

import com.exceptioncoder.toolbox.browserrequest.domain.ParamSpec;
import com.exceptioncoder.toolbox.browserrequest.domain.StepSpec;
import com.exceptioncoder.toolbox.browserrequest.domain.Task;
import com.exceptioncoder.toolbox.browserrequest.domain.TaskOptions;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** browser_request_task 表的访问。steps/params/options 在 DB 中以 JSON 文本存储。 */
@Repository
public class BrowserRequestTaskRepository {

    private static final TypeReference<List<StepSpec>> STEPS_TYPE = new TypeReference<>() {};
    private static final TypeReference<List<ParamSpec>> PARAMS_TYPE = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final RowMapper<Task> row;

    public BrowserRequestTaskRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.row = (rs, i) -> new Task(
                rs.getString("id"),
                rs.getString("session_id"),
                rs.getString("recording_id"),
                rs.getString("name"),
                readList(rs.getString("steps_json"), STEPS_TYPE),
                readList(rs.getString("params_json"), PARAMS_TYPE),
                readOptions(rs.getString("options_json")),
                rs.getLong("created_at"),
                rs.getLong("updated_at")
        );
    }

    public void insert(Task t) {
        jdbc.update("""
                INSERT INTO browser_request_task
                  (id, session_id, recording_id, name, steps_json, params_json, options_json,
                   created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                t.id(), t.sessionId(), t.recordingId(), t.name(),
                writeJson(t.steps()), writeJson(t.params()), writeJson(t.options()),
                t.createdAt(), t.updatedAt());
    }

    public void update(Task t) {
        jdbc.update("""
                UPDATE browser_request_task
                   SET name = ?, steps_json = ?, params_json = ?, options_json = ?, updated_at = ?
                 WHERE id = ?
                """,
                t.name(), writeJson(t.steps()), writeJson(t.params()), writeJson(t.options()),
                t.updatedAt(), t.id());
    }

    public Optional<Task> findById(String id) {
        List<Task> rows = jdbc.query("SELECT * FROM browser_request_task WHERE id = ?", row, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<Task> findBySessionOrderByUpdatedDesc(String sessionId) {
        return jdbc.query(
                "SELECT * FROM browser_request_task WHERE session_id = ? ORDER BY updated_at DESC",
                row, sessionId);
    }

    public boolean deleteById(String id) {
        return jdbc.update("DELETE FROM browser_request_task WHERE id = ?", id) > 0;
    }

    /** 录制被删时把指向它的 task.recording_id 置空（task 自身保留）。 */
    public int detachRecording(String recordingId) {
        return jdbc.update(
                "UPDATE browser_request_task SET recording_id = NULL WHERE recording_id = ?",
                recordingId);
    }

    private String writeJson(Object v) {
        if (v == null) return null;
        try {
            return objectMapper.writeValueAsString(v);
        } catch (Exception e) {
            return null;
        }
    }

    private <T> List<T> readList(String json, TypeReference<List<T>> type) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, type);
        } catch (Exception e) {
            return List.of();
        }
    }

    private TaskOptions readOptions(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readValue(json, TaskOptions.class);
        } catch (Exception e) {
            return null;
        }
    }
}
