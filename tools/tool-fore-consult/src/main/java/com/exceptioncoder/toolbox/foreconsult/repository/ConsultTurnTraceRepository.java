package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurnTrace;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/** Durable turn/trace ledger independent from the replace-all consultation archive. */
@Repository
public class ConsultTurnTraceRepository {

    private static final RowMapper<ConsultTurnTrace> ROW = (rs, rowNum) -> new ConsultTurnTrace(
            rs.getString("turn_id"), rs.getString("session_id"), rs.getInt("turn_index"),
            rs.getString("trace_id"), rs.getLong("started_at"),
            rs.getObject("completed_at") == null ? null : rs.getLong("completed_at"));

    private final JdbcTemplate jdbc;

    public ConsultTurnTraceRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Single-user deployment: synchronized reservation also protects rapid consecutive sends. */
    public synchronized ConsultTurnTrace reserveNext(String sessionId) {
        for (int attempt = 0; attempt < 3; attempt++) {
            Integer next = jdbc.queryForObject("""
                    SELECT COALESCE(MAX(turn_index), 0) + 1 FROM (
                        SELECT turn_index FROM consult_turn_trace WHERE session_id = ?
                        UNION ALL
                        SELECT turn_index FROM consult_turn WHERE session_id = ?
                    )
                    """, Integer.class, sessionId, sessionId);
            ConsultTurnTrace reservation = new ConsultTurnTrace(
                    UUID.randomUUID().toString(), sessionId, next == null ? 1 : next,
                    null, System.currentTimeMillis(), null);
            try {
                jdbc.update("INSERT INTO consult_turn_trace "
                                + "(turn_id, session_id, turn_index, started_at) VALUES (?, ?, ?, ?)",
                        reservation.turnId(), reservation.sessionId(), reservation.turnIndex(), reservation.startedAt());
                return reservation;
            } catch (DuplicateKeyException ignored) {
                // Re-read MAX and retry. This is only expected during simultaneous dispatch.
            }
        }
        throw new IllegalStateException("无法预留咨询轮次");
    }

    public Optional<ConsultTurnTrace> find(String sessionId, int turnIndex) {
        return jdbc.query("SELECT * FROM consult_turn_trace WHERE session_id = ? AND turn_index = ?",
                ROW, sessionId, turnIndex).stream().findFirst();
    }

    public void bindTrace(String turnId, String traceId, long completedAt) {
        if (turnId == null || turnId.isBlank() || traceId == null || !traceId.matches("[0-9a-f]{32}")) {
            return;
        }
        jdbc.update("UPDATE consult_turn_trace SET trace_id = COALESCE(trace_id, ?), completed_at = ? WHERE turn_id = ?",
                traceId, completedAt, turnId);
        String effectiveTraceId = jdbc.query("SELECT trace_id FROM consult_turn_trace WHERE turn_id = ?",
                (rs, rowNum) -> rs.getString("trace_id"), turnId).stream().findFirst().orElse(null);
        if (effectiveTraceId != null) {
            jdbc.update("UPDATE consult_turn SET trace_id = ? WHERE turn_id = ?", effectiveTraceId, turnId);
        }
    }
}
