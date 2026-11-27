package com.exceptioncoder.toolbox.foreconsult.backend;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Owns integration persistence. No reads of another tool's tables. */
@Repository
public class ConsultBackendStore {
    private final JdbcTemplate jdbc;

    public record ExternalSession(String id, String title, String codexHome, String model, String projects, String threadId,
                                  String activeTaskId) {}

    public ExternalSession externalSession(Client client, ConsultAnalysisInput input, String codexHome, String model) {
        String title = input.externalUserId() + "-实施答疑";
        jdbc.update("INSERT INTO consult_external_session (session_id, client_id, tenant_id, external_user_id, title, codex_home, model, project_ids, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (client_id, tenant_id, external_user_id) DO NOTHING",
                java.util.UUID.randomUUID().toString(), client.id(), client.tenantId(), input.externalUserId(),
                title, codexHome, model, client.projects(), System.currentTimeMillis());
        var session = findExternalSession(client.id(), client.tenantId(), input.externalUserId()).orElseThrow();
        if (!session.projects().equals(client.projects())) {
            throw new ConsultBackendException(409, "EXTERNAL_SESSION_SCOPE_CHANGED", "应用授权系统已变化，历史上下文需核对后再使用", false);
        }
        return session;
    }

    public Optional<ExternalSession> findExternalSession(String clientId, String tenantId, String userId) {
        return jdbc.query("SELECT session_id, title, codex_home, model, project_ids, thread_id, active_task_id FROM consult_external_session "
                        + "WHERE client_id = ? AND tenant_id = ? AND external_user_id = ?",
                (r, n) -> new ExternalSession(r.getString("session_id"), r.getString("title"), r.getString("codex_home"),
                        r.getString("model"), r.getString("project_ids"), r.getString("thread_id"), r.getString("active_task_id")),
                clientId, tenantId, userId).stream().findFirst();
    }

    public void acquireExternalSession(ExternalSession session, String taskId) {
        if (jdbc.update("UPDATE consult_external_session SET active_task_id = ? WHERE session_id = ? AND active_task_id IS NULL",
                taskId, session.id()) != 1) {
            throw new ConsultBackendException(409, "EXTERNAL_SESSION_BUSY", "该用户会话仍有进行中或结果待核对的任务，请先查询原任务", false);
        }
    }

    public void bindExternalThread(String sessionId, String taskId, String threadId) {
        if (threadId == null || threadId.isBlank() || jdbc.update("UPDATE consult_external_session SET thread_id = ? "
                        + "WHERE session_id = ? AND active_task_id = ? AND (thread_id IS NULL OR thread_id = ?)",
                threadId, sessionId, taskId, threadId) != 1) {
            throw new IllegalStateException("原生会话身份变化或当前任务已失去执行权");
        }
    }

    public void releaseExternalSession(String sessionId, String taskId) {
        if (jdbc.update("UPDATE consult_external_session SET active_task_id = NULL WHERE session_id = ? AND active_task_id = ? AND thread_id IS NOT NULL",
                sessionId, taskId) != 1) {
            throw new IllegalStateException("未取得原生线程身份，不能确认连续会话成功");
        }
    }

    public void releaseStoppedExternalSession(String sessionId, String taskId) {
        jdbc.update("UPDATE consult_external_session SET active_task_id = NULL WHERE session_id = ? AND active_task_id = ?",
                sessionId, taskId);
    }

    public boolean externalUserPending(String clientId, ConsultAnalysisInput input) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM consult_analysis_task WHERE client_id = ? "
                        + "AND status IN ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED') "
                        + "AND json_extract(input_json, '$.tenantId') = ? AND json_extract(input_json, '$.externalUserId') = ?",
                Integer.class, clientId, input.tenantId(), input.externalUserId()) > 0;
    }

    public ConsultBackendStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Client(String id, String appId, String tenantId, String secretHash,
                         String projects, long version, boolean enabled, long expiresAt) {}
    public record ClientMetadata(String id, String appId, String tenantId, String projects,
                                 long version, boolean enabled, long expiresAt, String changedBy, long changedAt) {}
    public record Task(String id, String clientId, String requestId, String inputHash, String input,
                       String status, String result, String errorCode, long createdAt,
                       Long startedAt, Long finishedAt, Long policyVersion) {}

    private static final String CLIENT_COLUMNS = "client_id, app_id, tenant_id, secret_hash, project_ids, version, enabled, expires_at";
    private static final String TASK_COLUMNS = "task_id, client_id, request_id, input_hash, input_json, status, result_json, error_code, created_at, started_at, finished_at, policy_version";

    public Optional<Client> client(String id) {
        return jdbc.query("SELECT " + CLIENT_COLUMNS + " FROM consult_service_client WHERE client_id = ?",
                (r, n) -> client(r), id).stream().findFirst();
    }

    /** Explicit projection prevents credential digests from entering the management response. */
    public List<ClientMetadata> clients(String query) {
        String pattern = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        return jdbc.query("SELECT client_id, app_id, tenant_id, project_ids, version, enabled, expires_at, changed_by, changed_at FROM consult_service_client "
                        + "WHERE app_id LIKE ? ESCAPE '\\' OR tenant_id LIKE ? ESCAPE '\\' OR client_id LIKE ? ESCAPE '\\' "
                        + "ORDER BY app_id, tenant_id, client_id LIMIT 201",
                (r, n) -> new ClientMetadata(r.getString("client_id"), r.getString("app_id"), r.getString("tenant_id"),
                        r.getString("project_ids"), r.getLong("version"), r.getBoolean("enabled"), r.getLong("expires_at"),
                        r.getString("changed_by"), r.getLong("changed_at")), pattern, pattern, pattern);
    }

    private Client client(ResultSet r) throws SQLException {
        return new Client(r.getString("client_id"), r.getString("app_id"), r.getString("tenant_id"),
                r.getString("secret_hash"), r.getString("project_ids"), r.getLong("version"),
                r.getBoolean("enabled"), r.getLong("expires_at"));
    }

    public void insertClient(Client c, String actor) {
        jdbc.update("INSERT INTO consult_service_client (client_id, app_id, tenant_id, secret_hash, project_ids, version, enabled, expires_at, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                c.id(), c.appId(), c.tenantId(), c.secretHash(), c.projects(), c.version(), c.enabled(), c.expiresAt(), actor, System.currentTimeMillis());
    }

    public boolean rotate(String id, String hash, long expectedVersion, long expiresAt, String actor) {
        return jdbc.update("UPDATE consult_service_client SET secret_hash = ?, version = version + 1, expires_at = ?, changed_by = ?, changed_at = ? WHERE client_id = ? AND version = ? AND enabled = 1",
                hash, expiresAt, actor, System.currentTimeMillis(), id, expectedVersion) == 1;
    }

    public void revoke(String id, String actor) {
        jdbc.update("UPDATE consult_service_client SET enabled = 0, version = version + 1, changed_by = ?, changed_at = ? WHERE client_id = ? AND enabled = 1",
                actor, System.currentTimeMillis(), id);
    }

    public void token(String hash, Client c, long until) {
        jdbc.update("DELETE FROM consult_service_token WHERE expires_at <= ?", System.currentTimeMillis());
        jdbc.update("INSERT INTO consult_service_token (token_hash, client_id, client_version, expires_at) VALUES (?, ?, ?, ?)",
                hash, c.id(), c.version(), until);
    }

    public Optional<Client> tokenClient(String hash) {
        return jdbc.query("SELECT c.client_id, c.app_id, c.tenant_id, c.secret_hash, c.project_ids, c.version, c.enabled, c.expires_at FROM consult_service_token t JOIN consult_service_client c ON c.client_id = t.client_id AND c.version = t.client_version WHERE t.token_hash = ? AND t.expires_at > ? AND c.expires_at > ? AND c.enabled = 1",
                (r, n) -> client(r), hash, System.currentTimeMillis(), System.currentTimeMillis()).stream().findFirst();
    }

    public Optional<Task> task(String id) {
        return jdbc.query("SELECT " + TASK_COLUMNS + " FROM consult_analysis_task WHERE task_id = ?", (r, n) -> task(r), id).stream().findFirst();
    }

    public Optional<Task> request(String client, String request) {
        return jdbc.query("SELECT " + TASK_COLUMNS + " FROM consult_analysis_task WHERE client_id = ? AND request_id = ?",
                (r, n) -> task(r), client, request).stream().findFirst();
    }

    private Task task(ResultSet r) throws SQLException {
        return new Task(r.getString("task_id"), r.getString("client_id"), r.getString("request_id"),
                r.getString("input_hash"), r.getString("input_json"), r.getString("status"), r.getString("result_json"),
                r.getString("error_code"), r.getLong("created_at"), (Long) nullableLong(r, "started_at"),
                (Long) nullableLong(r, "finished_at"), (Long) nullableLong(r, "policy_version"));
    }

    private Long nullableLong(ResultSet r, String column) throws SQLException {
        long value = r.getLong(column);
        return r.wasNull() ? null : value;
    }

    public void insertTask(Task t) {
        jdbc.update("INSERT INTO consult_analysis_task (task_id, client_id, request_id, input_hash, input_json, status, created_at) VALUES (?, ?, ?, ?, ?, 'QUEUED', ?)",
                t.id(), t.clientId(), t.requestId(), t.inputHash(), t.input(), t.createdAt());
    }

    public int unfinished(String client) {
        String sql = "SELECT COUNT(*) FROM consult_analysis_task WHERE status IN ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED')";
        return client == null ? jdbc.queryForObject(sql, Integer.class)
                : jdbc.queryForObject(sql + " AND client_id = ?", Integer.class, client);
    }

    public List<Task> queued() {
        return jdbc.query("SELECT " + TASK_COLUMNS + " FROM consult_analysis_task WHERE status = 'QUEUED' ORDER BY created_at, task_id LIMIT 2", (r, n) -> task(r));
    }

    public boolean claim(String id) {
        return jdbc.update("UPDATE consult_analysis_task SET status = 'RUNNING', started_at = ? WHERE task_id = ? AND status = 'QUEUED'", System.currentTimeMillis(), id) == 1;
    }

    public void policyVersion(String id, long version) {
        jdbc.update("UPDATE consult_analysis_task SET policy_version = ? WHERE task_id = ? AND status = 'RUNNING'", version, id);
    }

    public void cancel(String id, String reason) {
        jdbc.update("UPDATE consult_analysis_task SET status = 'CANCELLED', finished_at = ?, error_code = ? WHERE task_id = ? AND status = 'QUEUED'", System.currentTimeMillis(), reason, id);
        jdbc.update("UPDATE consult_analysis_task SET status = 'CANCEL_REQUESTED', error_code = ? WHERE task_id = ? AND status = 'RUNNING'", reason, id);
    }

    public void finish(String id, String status, String result, String code) {
        jdbc.update("UPDATE consult_analysis_task SET status = ?, result_json = ?, error_code = ?, finished_at = ? WHERE task_id = ? AND status = 'RUNNING'",
                status, result, code, System.currentTimeMillis(), id);
        jdbc.update("UPDATE consult_analysis_task SET status = CASE WHEN error_code = 'ANALYSIS_TIMEOUT' THEN 'TIMED_OUT' WHEN error_code = 'EXECUTION_INTERRUPTED' THEN 'INTERRUPTED' ELSE 'CANCELLED' END, result_json = NULL, finished_at = ? WHERE task_id = ? AND status = 'CANCEL_REQUESTED'",
                System.currentTimeMillis(), id);
    }

    public void recover() {
        jdbc.update("UPDATE consult_analysis_task SET status = 'INTERRUPTED', error_code = 'EXECUTION_INTERRUPTED', finished_at = ? WHERE status IN ('RUNNING', 'CANCEL_REQUESTED')", System.currentTimeMillis());
    }
}
