package com.exceptioncoder.toolbox.browserrequest.repository;

import com.exceptioncoder.toolbox.browserrequest.domain.StepResult;
import com.exceptioncoder.toolbox.browserrequest.domain.TaskRun;
import com.exceptioncoder.toolbox.browserrequest.domain.enums.TaskRunStatus;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/** browser_request_task_run 表的访问。inputs/stepResults 字段在 DB 中以 JSON 文本存。 */
@Repository
public class TaskRunRepository {

    private static final TypeReference<Map<String, Object>> INPUTS_TYPE = new TypeReference<>() {};
    private static final TypeReference<List<StepResult>> RESULTS_TYPE = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final RowMapper<TaskRun> row;

    public TaskRunRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.row = (rs, i) -> new TaskRun(
                rs.getString("id"),
                rs.getString("task_id"),
                TaskRunStatus.valueOf(rs.getString("status")),
                rs.getLong("started_at"),
                rs.getObject("finished_at") != null ? rs.getLong("finished_at") : null,
                readMap(rs.getString("inputs_json")),
                readResults(rs.getString("step_results_json")),
                rs.getString("error_message")
        );
    }

    public void insert(TaskRun r) {
        jdbc.update("""
                INSERT INTO browser_request_task_run
                  (id, task_id, status, started_at, finished_at, inputs_json, step_results_json, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                r.id(), r.taskId(), r.status().name(),
                r.startedAt(), r.finishedAt(),
                writeJson(r.inputs()), writeJson(r.stepResults()), r.errorMessage());
    }

    public void update(TaskRun r) {
        jdbc.update("""
                UPDATE browser_request_task_run
                   SET status = ?, finished_at = ?, step_results_json = ?, error_message = ?
                 WHERE id = ?
                """,
                r.status().name(), r.finishedAt(),
                writeJson(r.stepResults()), r.errorMessage(),
                r.id());
    }

    public Optional<TaskRun> findById(String id) {
        List<TaskRun> rows = jdbc.query("SELECT * FROM browser_request_task_run WHERE id = ?", row, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<TaskRun> findByTaskOrderByStartedDesc(String taskId, int limit) {
        return jdbc.query(
                "SELECT * FROM browser_request_task_run WHERE task_id = ? ORDER BY started_at DESC LIMIT ?",
                row, taskId, limit);
    }

    public int deleteByTask(String taskId) {
        return jdbc.update("DELETE FROM browser_request_task_run WHERE task_id = ?", taskId);
    }

    private String writeJson(Object v) {
        if (v == null) return null;
        try {
            return objectMapper.writeValueAsString(v);
        } catch (Exception e) {
            return null;
        }
    }

    private Map<String, Object> readMap(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, INPUTS_TYPE);
        } catch (Exception e) {
            return Map.of();
        }
    }

    private List<StepResult> readResults(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, RESULTS_TYPE);
        } catch (Exception e) {
            return List.of();
        }
    }
}
