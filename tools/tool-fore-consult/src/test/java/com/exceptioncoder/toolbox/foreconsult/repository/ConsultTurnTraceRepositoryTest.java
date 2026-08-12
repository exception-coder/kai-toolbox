package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurnTrace;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;

class ConsultTurnTraceRepositoryTest {

    private ConsultTurnTraceRepository repository;
    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        SingleConnectionDataSource dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("CREATE TABLE consult_turn (turn_id TEXT PRIMARY KEY, session_id TEXT, turn_index INTEGER, trace_id TEXT)");
        jdbc.execute("CREATE TABLE consult_turn_trace (turn_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, "
                + "turn_index INTEGER NOT NULL, trace_id TEXT, started_at INTEGER NOT NULL, completed_at INTEGER, "
                + "UNIQUE(session_id, turn_index))");
        repository = new ConsultTurnTraceRepository(jdbc);
    }

    @Test
    void reservesStableSequentialTurnsAndBindsTraceIdempotently() {
        ConsultTurnTrace first = repository.reserveNext("session-1");
        ConsultTurnTrace second = repository.reserveNext("session-1");
        assertThat(first.turnIndex()).isEqualTo(1);
        assertThat(second.turnIndex()).isEqualTo(2);

        jdbc.update("INSERT INTO consult_turn(turn_id, session_id, turn_index) VALUES (?, ?, ?)",
                first.turnId(), first.sessionId(), first.turnIndex());
        repository.bindTrace(first.turnId(), "0123456789abcdef0123456789abcdef", 100L);
        repository.bindTrace(first.turnId(), "ffffffffffffffffffffffffffffffff", 200L);

        ConsultTurnTrace bound = repository.find("session-1", 1).orElseThrow();
        assertThat(bound.traceId()).isEqualTo("0123456789abcdef0123456789abcdef");
        assertThat(jdbc.queryForObject("SELECT trace_id FROM consult_turn WHERE turn_id = ?",
                String.class, first.turnId())).isEqualTo("0123456789abcdef0123456789abcdef");
    }
}
