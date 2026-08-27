package com.exceptioncoder.toolbox.scheduler.repository;

import com.exceptioncoder.toolbox.scheduler.domain.SchedulerModels.ExecutionView;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class SchedulerRepository {
    private static final String EXECUTION_FIELDS =
            "id, task_id, trigger_source, status, start_time, end_time, duration_ms, error_summary";
    private final JdbcTemplate jdbcTemplate;

    public SchedulerRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<TaskOverride> findOverride(String id) {
        List<TaskOverride> rows = jdbcTemplate.query(
                "SELECT id, enabled, cron, zone FROM scheduler_task_override WHERE id = ?",
                (rs, rowNum) -> new TaskOverride(rs.getString("id"), rs.getInt("enabled") == 1,
                        rs.getString("cron"), rs.getString("zone")), id);
        return rows.stream().findFirst();
    }

    public void saveOverride(String id, boolean enabled, String cron, String zone) {
        long now = System.currentTimeMillis();
        jdbcTemplate.update("""
                INSERT INTO scheduler_task_override(id, enabled, cron, zone, create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled, cron=excluded.cron,
                    zone=excluded.zone, update_time=excluded.update_time
                """, id, enabled ? 1 : 0, cron, zone, now, now);
    }

    public void startExecution(String id, String taskId, String source, long startedAt) {
        jdbcTemplate.update("""
                INSERT INTO scheduler_execution(
                    id, task_id, trigger_source, status, start_time, create_time, update_time)
                VALUES (?, ?, ?, 'RUNNING', ?, ?, ?)
                """, id, taskId, source, startedAt, startedAt, startedAt);
    }

    public void finishExecution(String id, String status, long endedAt, long duration, String error) {
        jdbcTemplate.update("""
                UPDATE scheduler_execution SET status = ?, end_time = ?, duration_ms = ?,
                    error_summary = ?, update_time = ? WHERE id = ?
                """, status, endedAt, duration, error, endedAt, id);
    }

    public List<ExecutionView> listExecutions(String taskId, int limit) {
        return jdbcTemplate.query("SELECT " + EXECUTION_FIELDS + " FROM scheduler_execution "
                        + "WHERE task_id = ? ORDER BY start_time DESC LIMIT ?",
                (rs, rowNum) -> new ExecutionView(
                        rs.getString("id"), rs.getString("task_id"), rs.getString("trigger_source"),
                        rs.getString("status"), Instant.ofEpochMilli(rs.getLong("start_time")),
                        nullableInstant(rs.getObject("end_time")), nullableLong(rs.getObject("duration_ms")),
                        rs.getString("error_summary")), taskId, limit);
    }

    public void abortStaleExecutions() {
        long now = System.currentTimeMillis();
        jdbcTemplate.update("""
                UPDATE scheduler_execution SET status = 'ABORTED', end_time = ?,
                    duration_ms = ? - start_time, error_summary = '应用重启导致执行中断', update_time = ?
                WHERE status = 'RUNNING'
                """, now, now, now);
    }

    public void trimExecutions(String taskId, int keep) {
        jdbcTemplate.update("""
                DELETE FROM scheduler_execution WHERE task_id = ? AND id NOT IN (
                    SELECT id FROM scheduler_execution WHERE task_id = ?
                    ORDER BY start_time DESC LIMIT ?)
                """, taskId, taskId, keep);
    }

    private Instant nullableInstant(Object value) {
        return value == null ? null : Instant.ofEpochMilli(((Number) value).longValue());
    }

    private Long nullableLong(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }

    public record TaskOverride(String id, boolean enabled, String cron, String zone) {
    }
}
