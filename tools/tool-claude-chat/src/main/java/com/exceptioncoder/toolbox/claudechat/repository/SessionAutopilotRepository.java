package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotCompletionPolicy;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotDisposition;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotState;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotStep;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.ArrayList;

/** 自动监督当前状态与 settled-turn 审计步骤的 SQLite 适配器。 */
@Repository
public class SessionAutopilotRepository {

    private static final String SELECT_COLUMNS = """
            id, session_id, goal, completion_policy, state, reason,
            project_root, repository_identity, branch_at_start, workspace_fingerprint,
            change_id, change_revision, current_task_id, current_task_ordinal, phase,
            agent_session_ref, generation, version, turn_count, max_turns,
            no_progress_count, max_no_progress, auto_archive, skill_activated,
            skill_path, skill_version, skill_fingerprint, runtime_supervision,
            completed_tasks, total_tasks, latest_disposition, latest_summary,
            latest_next_action, latest_remaining_work_json, latest_evidence_json,
            latest_report_at, started_at, deadline_at, updated_at
            """;

    private final JdbcTemplate jdbc;
    private final RowMapper<SessionAutopilotRun> mapper = this::mapRun;

    public SessionAutopilotRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<SessionAutopilotRun> findBySessionId(String sessionId) {
        return jdbc.query("SELECT " + SELECT_COLUMNS
                        + " FROM claude_chat_autopilot_run WHERE session_id = ?", mapper, sessionId)
                .stream().findFirst();
    }

    public Optional<SessionAutopilotRun> findById(String runId) {
        return jdbc.query("SELECT " + SELECT_COLUMNS
                        + " FROM claude_chat_autopilot_run WHERE id = ?", mapper, runId)
                .stream().findFirst();
    }

    /** 返回绑定到指定 OpenSpec change 的监督运行，供 change 级证据聚合。 */
    public List<SessionAutopilotRun> findByChangeId(String changeId) {
        return jdbc.query("SELECT " + SELECT_COLUMNS + """
                 FROM claude_chat_autopilot_run
                WHERE change_id = ?
                ORDER BY updated_at DESC, id DESC
                """, mapper, changeId);
    }

    public List<SessionAutopilotRun> findRecent(String search, Long beforeUpdatedAt,
                                                String beforeId, int limit) {
        String normalizedSearch = search == null ? "" : search.trim().toLowerCase();
        long cursorTime = beforeUpdatedAt == null ? Long.MAX_VALUE : beforeUpdatedAt;
        String cursorId = beforeId == null || beforeId.isBlank() ? "\uffff" : beforeId;
        return jdbc.query("SELECT " + SELECT_COLUMNS + """
                 FROM claude_chat_autopilot_run
                WHERE (lower(goal) LIKE ? OR lower(change_id) LIKE ? OR lower(project_root) LIKE ?)
                  AND (updated_at < ? OR (updated_at = ? AND id < ?))
                ORDER BY updated_at DESC, id DESC
                LIMIT ?
                """, mapper, "%" + normalizedSearch + "%", "%" + normalizedSearch + "%",
                "%" + normalizedSearch + "%", cursorTime, cursorTime, cursorId, Math.max(1, Math.min(limit, 200)));
    }

    /** 看板范围在 SQL 层过滤，避免先截断再过滤造成空页或漏项。 */
    public List<SessionAutopilotRun> findRecentByStates(String search, Long beforeUpdatedAt,
                                                        String beforeId, int limit,
                                                        List<AutopilotState> states) {
        if (states == null || states.isEmpty()) {
            return List.of();
        }
        String normalizedSearch = search == null ? "" : search.trim().toLowerCase();
        long cursorTime = beforeUpdatedAt == null ? Long.MAX_VALUE : beforeUpdatedAt;
        String cursorId = beforeId == null || beforeId.isBlank() ? "\uffff" : beforeId;
        String placeholders = String.join(",", java.util.Collections.nCopies(states.size(), "?"));
        List<Object> arguments = new ArrayList<>();
        states.forEach(state -> arguments.add(state.name()));
        arguments.add("%" + normalizedSearch + "%");
        arguments.add("%" + normalizedSearch + "%");
        arguments.add("%" + normalizedSearch + "%");
        arguments.add(cursorTime);
        arguments.add(cursorTime);
        arguments.add(cursorId);
        arguments.add(Math.max(1, Math.min(limit, 200)));
        return jdbc.query("SELECT " + SELECT_COLUMNS + " FROM claude_chat_autopilot_run"
                + " WHERE state IN (" + placeholders + ")"
                + " AND (lower(goal) LIKE ? OR lower(change_id) LIKE ? OR lower(project_root) LIKE ?)"
                + " AND (updated_at < ? OR (updated_at = ? AND id < ?))"
                + " ORDER BY updated_at DESC, id DESC LIMIT ?", mapper, arguments.toArray());
    }

    /** 新运行替换同会话旧的当前投影；历史步骤随旧运行级联清理。 */
    @Transactional
    public void replace(SessionAutopilotRun run) {
        jdbc.update("DELETE FROM claude_chat_autopilot_run WHERE session_id = ? AND id <> ?",
                run.sessionId(), run.id());
        insert(run);
    }

    public boolean update(SessionAutopilotRun run, long expectedVersion) {
        OpenSpecExecutionContext context = run.context();
        int changed = jdbc.update("""
                UPDATE claude_chat_autopilot_run SET
                    goal = ?, completion_policy = ?, state = ?, reason = ?,
                    project_root = ?, repository_identity = ?, branch_at_start = ?, workspace_fingerprint = ?,
                    change_id = ?, change_revision = ?, current_task_id = ?, current_task_ordinal = ?, phase = ?,
                    agent_session_ref = ?, generation = ?, version = ?, turn_count = ?, max_turns = ?,
                    no_progress_count = ?, max_no_progress = ?, auto_archive = ?, skill_activated = ?,
                    skill_path = ?, skill_version = ?, skill_fingerprint = ?, runtime_supervision = ?,
                    completed_tasks = ?, total_tasks = ?, latest_disposition = ?, latest_summary = ?,
                    latest_next_action = ?, latest_remaining_work_json = ?, latest_evidence_json = ?,
                    latest_report_at = ?, deadline_at = ?, updated_at = ?
                WHERE id = ? AND version = ?
                """,
                run.goal(), run.completionPolicy().name(), run.state().name(), run.reason(),
                context.projectRoot(), context.repositoryIdentity(), context.branchAtStart(),
                context.workspaceFingerprint(), context.changeId(), context.changeRevision(),
                context.currentTaskId(), context.currentTaskOrdinal(), context.phase().name(),
                context.agentSessionRef(), context.generation(), context.version(), run.turnCount(), run.maxTurns(),
                run.noProgressCount(), run.maxNoProgress(), bool(run.autoArchive()), bool(run.skillActivated()),
                run.skillPath(), run.skillVersion(), run.skillFingerprint(), bool(run.runtimeSupervision()),
                run.completedTasks(), run.totalTasks(), name(run.latestDisposition()), run.latestSummary(),
                run.latestNextAction(), run.latestRemainingWorkJson(), run.latestEvidenceJson(),
                millis(run.latestReportAt()), run.deadlineAt().toEpochMilli(), run.updatedAt().toEpochMilli(),
                run.id(), expectedVersion);
        return changed == 1;
    }

    /** 同一个 run/generation/predecessor 只允许记录一次。 */
    public boolean appendStep(AutopilotStep step) {
        return jdbc.update("""
                INSERT OR IGNORE INTO claude_chat_autopilot_step
                    (run_id, generation, predecessor_turn_id, message_id, phase, task_id,
                     disposition, summary, evidence_json, progress_fingerprint, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, step.runId(), step.generation(), step.predecessorTurnId(), step.messageId(),
                step.phase().name(), step.taskId(), step.disposition(), step.summary(), step.evidenceJson(),
                step.progressFingerprint(), step.createdAt().toEpochMilli()) == 1;
    }

    public long countSteps(String runId) {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM claude_chat_autopilot_step WHERE run_id = ?", Long.class, runId);
        return count == null ? 0L : count;
    }

    private void insert(SessionAutopilotRun run) {
        OpenSpecExecutionContext context = run.context();
        jdbc.update("""
                INSERT INTO claude_chat_autopilot_run (
                    id, session_id, goal, completion_policy, state, reason,
                    project_root, repository_identity, branch_at_start, workspace_fingerprint,
                    change_id, change_revision, current_task_id, current_task_ordinal, phase,
                    agent_session_ref, generation, version, turn_count, max_turns,
                    no_progress_count, max_no_progress, auto_archive, skill_activated,
                    skill_path, skill_version, skill_fingerprint, runtime_supervision,
                    completed_tasks, total_tasks, latest_disposition, latest_summary,
                    latest_next_action, latest_remaining_work_json, latest_evidence_json,
                    latest_report_at, started_at, deadline_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, run.id(), run.sessionId(), run.goal(), run.completionPolicy().name(), run.state().name(),
                run.reason(), context.projectRoot(), context.repositoryIdentity(), context.branchAtStart(),
                context.workspaceFingerprint(), context.changeId(), context.changeRevision(), context.currentTaskId(),
                context.currentTaskOrdinal(), context.phase().name(), context.agentSessionRef(), context.generation(),
                context.version(), run.turnCount(), run.maxTurns(), run.noProgressCount(), run.maxNoProgress(),
                bool(run.autoArchive()), bool(run.skillActivated()), run.skillPath(), run.skillVersion(),
                run.skillFingerprint(), bool(run.runtimeSupervision()), run.completedTasks(), run.totalTasks(),
                name(run.latestDisposition()), run.latestSummary(), run.latestNextAction(),
                run.latestRemainingWorkJson(), run.latestEvidenceJson(), millis(run.latestReportAt()),
                run.startedAt().toEpochMilli(), run.deadlineAt().toEpochMilli(), run.updatedAt().toEpochMilli());
    }

    private SessionAutopilotRun mapRun(ResultSet rs, int rowNumber) throws SQLException {
        OpenSpecExecutionContext context = new OpenSpecExecutionContext(
                rs.getString("project_root"), rs.getString("repository_identity"),
                rs.getString("branch_at_start"), rs.getString("workspace_fingerprint"),
                rs.getString("change_id"), rs.getString("change_revision"), rs.getString("current_task_id"),
                nullableInteger(rs, "current_task_ordinal"), OpenSpecExecutionPhase.valueOf(rs.getString("phase")),
                rs.getString("agent_session_ref"), rs.getLong("generation"), rs.getLong("version"));
        return new SessionAutopilotRun(
                rs.getString("id"), rs.getString("session_id"), rs.getString("goal"),
                AutopilotCompletionPolicy.valueOf(rs.getString("completion_policy")),
                AutopilotState.valueOf(rs.getString("state")), rs.getString("reason"), context,
                rs.getInt("turn_count"), rs.getInt("max_turns"), rs.getInt("no_progress_count"),
                rs.getInt("max_no_progress"), rs.getInt("auto_archive") == 1,
                rs.getInt("skill_activated") == 1, rs.getString("skill_path"), rs.getString("skill_version"),
                rs.getString("skill_fingerprint"), rs.getInt("runtime_supervision") == 1,
                rs.getInt("completed_tasks"), rs.getInt("total_tasks"),
                enumValue(AutopilotDisposition.class, rs.getString("latest_disposition")),
                rs.getString("latest_summary"), rs.getString("latest_next_action"),
                rs.getString("latest_remaining_work_json"), rs.getString("latest_evidence_json"),
                instant(rs, "latest_report_at"), Instant.ofEpochMilli(rs.getLong("started_at")),
                Instant.ofEpochMilli(rs.getLong("deadline_at")), Instant.ofEpochMilli(rs.getLong("updated_at")));
    }

    private Integer nullableInteger(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private Instant instant(ResultSet rs, String column) throws SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : Instant.ofEpochMilli(value);
    }

    private static int bool(boolean value) {
        return value ? 1 : 0;
    }

    private static Long millis(Instant value) {
        return value == null ? null : value.toEpochMilli();
    }

    private static String name(Enum<?> value) {
        return value == null ? null : value.name();
    }

    private static <T extends Enum<T>> T enumValue(Class<T> type, String value) {
        return value == null || value.isBlank() ? null : Enum.valueOf(type, value);
    }
}
