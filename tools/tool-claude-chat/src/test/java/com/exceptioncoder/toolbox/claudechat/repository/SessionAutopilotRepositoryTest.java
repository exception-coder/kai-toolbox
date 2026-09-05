package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotCompletionPolicy;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotState;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotStep;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SessionAutopilotRepositoryTest {

    private SessionAutopilotRepository repository;
    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        jdbc.execute("PRAGMA foreign_keys = ON");
        jdbc.execute("CREATE TABLE claude_chat_session (id TEXT PRIMARY KEY)");
        jdbc.update("INSERT INTO claude_chat_session(id) VALUES ('session-1')");
        jdbc.update("INSERT INTO claude_chat_session(id) VALUES ('session-2')");
        jdbc.execute("""
                CREATE TABLE claude_chat_autopilot_run (
                  id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE, goal TEXT NOT NULL,
                  completion_policy TEXT NOT NULL, state TEXT NOT NULL, reason TEXT,
                  project_root TEXT NOT NULL, repository_identity TEXT, branch_at_start TEXT,
                  workspace_fingerprint TEXT, change_id TEXT NOT NULL, change_revision TEXT NOT NULL,
                  current_task_id TEXT, current_task_ordinal INTEGER, phase TEXT NOT NULL,
                  agent_session_ref TEXT, generation INTEGER NOT NULL, version INTEGER NOT NULL,
                  turn_count INTEGER NOT NULL, max_turns INTEGER NOT NULL, no_progress_count INTEGER NOT NULL,
                  max_no_progress INTEGER NOT NULL, auto_archive INTEGER NOT NULL, skill_activated INTEGER NOT NULL,
                  skill_path TEXT, skill_version TEXT, skill_fingerprint TEXT, runtime_supervision INTEGER NOT NULL,
                  completed_tasks INTEGER NOT NULL, total_tasks INTEGER NOT NULL, latest_disposition TEXT,
                  latest_summary TEXT, latest_next_action TEXT, latest_remaining_work_json TEXT,
                  latest_evidence_json TEXT, latest_report_at INTEGER, started_at INTEGER NOT NULL,
                  deadline_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
                  FOREIGN KEY(session_id) REFERENCES claude_chat_session(id) ON DELETE CASCADE)
                """);
        jdbc.execute("CREATE INDEX idx_claude_chat_autopilot_state_updated "
                + "ON claude_chat_autopilot_run(state, updated_at DESC, id DESC)");
        jdbc.execute("""
                CREATE TABLE claude_chat_autopilot_step (
                  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, generation INTEGER NOT NULL,
                  predecessor_turn_id TEXT NOT NULL, message_id TEXT, phase TEXT NOT NULL, task_id TEXT,
                  disposition TEXT NOT NULL, summary TEXT, evidence_json TEXT, progress_fingerprint TEXT,
                  created_at INTEGER NOT NULL, UNIQUE(run_id, generation, predecessor_turn_id),
                  FOREIGN KEY(run_id) REFERENCES claude_chat_autopilot_run(id) ON DELETE CASCADE)
                """);
        repository = new SessionAutopilotRepository(jdbc);
    }

    @Test
    void persistsContextAndRejectsStaleOptimisticUpdate() {
        SessionAutopilotRun original = run(0, AutopilotState.ACTIVE);
        repository.replace(original);
        SessionAutopilotRun updated = run(1, AutopilotState.PAUSED);

        assertThat(repository.update(updated, 0)).isTrue();
        assertThat(repository.update(run(2, AutopilotState.ACTIVE), 0)).isFalse();
        assertThat(repository.findBySessionId("session-1").orElseThrow().state())
                .isEqualTo(AutopilotState.PAUSED);
    }

    @Test
    void settledStepIsExactlyOncePerGenerationAndPredecessor() {
        repository.replace(run(0, AutopilotState.ACTIVE));
        AutopilotStep step = new AutopilotStep("run-1", 1, "turn-1", "message-1",
                OpenSpecExecutionPhase.APPLY, "6.4", "RESUME_SAME_TASK", "继续", "[]",
                "fingerprint", Instant.now());

        assertThat(repository.appendStep(step)).isTrue();
        assertThat(repository.appendStep(step)).isFalse();
        assertThat(repository.countSteps("run-1")).isEqualTo(1);
    }

    @Test
    void dashboardStateScopeUsesStableCursorAndIndexedPlan() {
        repository.replace(run("run-1", "session-1", 0, AutopilotState.ACTIVE,
                Instant.parse("2026-09-02T17:00:02Z")));
        repository.replace(run("run-2", "session-2", 0, AutopilotState.PAUSED,
                Instant.parse("2026-09-02T17:00:01Z")));

        List<SessionAutopilotRun> active = repository.findRecentByStates("session", null, null,
                30, List.of(AutopilotState.ACTIVE));

        assertThat(active).extracting(SessionAutopilotRun::id).containsExactly("run-1");
        List<Map<String, Object>> plan = jdbc.queryForList("""
                EXPLAIN QUERY PLAN
                SELECT id FROM claude_chat_autopilot_run
                 WHERE state IN ('ACTIVE') AND updated_at < 9999999999999
                 ORDER BY updated_at DESC, id DESC LIMIT 30
                """);
        assertThat(plan.toString()).contains("idx_claude_chat_autopilot_state_updated");
    }

    @Test
    void findsRunsByExactChangeId() {
        repository.replace(run("run-1", "session-1", 0, AutopilotState.ACTIVE,
                Instant.parse("2026-09-02T17:00:02Z")));
        repository.replace(run("run-2", "session-2", 0, AutopilotState.PAUSED,
                Instant.parse("2026-09-02T17:00:01Z")));

        assertThat(repository.findByChangeId("session-autopilot"))
                .extracting(SessionAutopilotRun::id)
                .containsExactly("run-1", "run-2");
        assertThat(repository.findByChangeId("session")).isEmpty();
    }

    private SessionAutopilotRun run(long version, AutopilotState state) {
        return run("run-1", "session-1", version, state, Instant.parse("2026-09-02T17:00:00Z"));
    }

    private SessionAutopilotRun run(String runId, String sessionId, long version, AutopilotState state,
                                    Instant now) {
        OpenSpecExecutionContext context = new OpenSpecExecutionContext(
                "D:/repo", "D:/repo", "main", "workspace", "session-autopilot", "revision",
                "6.4", 28, OpenSpecExecutionPhase.APPLY, "agent-1", 1, version);
        return new SessionAutopilotRun(runId, sessionId, "完成 session-autopilot change",
                AutopilotCompletionPolicy.OPEN_SPEC_STRICT, state, null, context,
                1, 60, 0, 3, true, false, ".agents/skills", "1.0.0", "hash", true,
                27, 36, null, null, null, null, null, null, now, now.plusSeconds(3600), now);
    }
}
