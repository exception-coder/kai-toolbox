package com.exceptioncoder.toolbox.browserrequest.repository;

import com.exceptioncoder.toolbox.browserrequest.domain.Recording;
import com.exceptioncoder.toolbox.browserrequest.domain.enums.RecordingStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** browser_request_recording 表的访问。 */
@Repository
public class RecordingRepository {

    private final JdbcTemplate jdbc;

    private static final RowMapper<Recording> ROW = (rs, i) -> new Recording(
            rs.getString("id"),
            rs.getString("session_id"),
            rs.getString("name"),
            RecordingStatus.valueOf(rs.getString("status")),
            rs.getInt("capture_script") == 1,
            rs.getLong("started_at"),
            rs.getObject("ended_at") != null ? rs.getLong("ended_at") : null,
            rs.getInt("call_count")
    );

    public RecordingRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(Recording r) {
        jdbc.update("""
                INSERT INTO browser_request_recording
                  (id, session_id, name, status, capture_script, started_at, ended_at, call_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                r.id(), r.sessionId(), r.name(), r.status().name(),
                r.captureScript() ? 1 : 0,
                r.startedAt(), r.endedAt(), r.callCount());
    }

    public Optional<Recording> findById(String id) {
        List<Recording> rows = jdbc.query(
                "SELECT * FROM browser_request_recording WHERE id = ?", ROW, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public Optional<Recording> findActiveBySession(String sessionId) {
        List<Recording> rows = jdbc.query(
                "SELECT * FROM browser_request_recording WHERE session_id = ? AND status = 'RECORDING' LIMIT 1",
                ROW, sessionId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<Recording> findBySessionOrderByStartedDesc(String sessionId) {
        return jdbc.query(
                "SELECT * FROM browser_request_recording WHERE session_id = ? ORDER BY started_at DESC",
                ROW, sessionId);
    }

    public void updateStatus(String id, RecordingStatus status, Long endedAt) {
        jdbc.update("UPDATE browser_request_recording SET status = ?, ended_at = ? WHERE id = ?",
                status.name(), endedAt, id);
    }

    public void incrementCallCount(String id, int delta) {
        jdbc.update("UPDATE browser_request_recording SET call_count = call_count + ? WHERE id = ?",
                delta, id);
    }

    /** 应用启动时调用：把上次进程意外结束遗留的 RECORDING 行统一标记为 ABANDONED。 */
    public int abandonAllOnStartup(long now) {
        return jdbc.update(
                "UPDATE browser_request_recording SET status = 'ABANDONED', ended_at = ? WHERE status = 'RECORDING'",
                now);
    }

    public boolean deleteById(String id) {
        return jdbc.update("DELETE FROM browser_request_recording WHERE id = ?", id) > 0;
    }
}
