package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

@Repository
public class ClaudeChatSessionRepository {

    private final JdbcTemplate jdbc;

    public ClaudeChatSessionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<ClaudeChatSession> ROW = (rs, i) -> ClaudeChatSession.builder()
            .id(rs.getString("id"))
            .userId(nullableLong(rs, "user_id"))
            .cwd(rs.getString("cwd"))
            .title(rs.getString("title"))
            .sdkSessionId(rs.getString("sdk_session_id"))
            .engine(rs.getString("engine") == null ? "claude" : rs.getString("engine"))
            .engines(rs.getString("engines"))
            .engineSessions(rs.getString("engine_sessions"))
            .apiBaseUrl(rs.getString("api_base_url"))
            .authToken(rs.getString("auth_token"))
            .codexHome(rs.getString("codex_home"))
            .selectedModel(rs.getString("selected_model"))
            .codexReasoningEffort(rs.getString("codex_reasoning_effort"))
            .codexSpeed(rs.getString("codex_speed"))
            .executionPolicy(rs.getString("execution_policy"))
            .consultEvidenceSystems(rs.getString("consult_evidence_systems"))
            .groupName(rs.getString("group_name"))
            .subgroupName(rs.getString("subgroup_name"))
            .favorite(rs.getInt("favorite") == 1)
            .status(SessionStatus.valueOf(rs.getString("status")))
            .startedAt(rs.getLong("started_at"))
            .lastSeenAt(rs.getLong("last_seen_at"))
            .build();

    private static Long nullableLong(ResultSet resultSet, String column) throws SQLException {
        long value = resultSet.getLong(column);
        return resultSet.wasNull() ? null : value;
    }

    public List<ClaudeChatSession> findAll() {
        return jdbc.query(
                "SELECT * FROM claude_chat_session ORDER BY last_seen_at DESC",
                ROW);
    }

    public Optional<ClaudeChatSession> findById(String id) {
        return jdbc.query("SELECT * FROM claude_chat_session WHERE id = ?", ROW, id)
                .stream().findFirst();
    }

    /** 查询项目分组下的会话，用于项目级操作前统一校验所有权。 */
    public List<ClaudeChatSession> findByGroupName(String groupName) {
        return jdbc.query(
                "SELECT * FROM claude_chat_session WHERE group_name = ? ORDER BY last_seen_at DESC",
                ROW, groupName);
    }

    public Optional<ClaudeChatSession> findBySdkSessionId(String sdkSessionId) {
        return jdbc.query(
                        "SELECT * FROM claude_chat_session WHERE sdk_session_id = ? ORDER BY last_seen_at DESC LIMIT 1",
                        ROW, sdkSessionId)
                .stream().findFirst();
    }

    public void insert(ClaudeChatSession s) {
        String engine = s.getEngine() == null ? "claude" : s.getEngine();
        jdbc.update("""
                INSERT INTO claude_chat_session
                  (id, user_id, cwd, title, sdk_session_id, engine, engines, api_base_url, auth_token, codex_home,
                   selected_model, codex_reasoning_effort, codex_speed, execution_policy, consult_evidence_systems,
                   status, started_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                s.getId(), s.getUserId(), s.getCwd(), s.getTitle(), s.getSdkSessionId(),
                engine, s.getEngines() == null ? engine : s.getEngines(),
                s.getApiBaseUrl(), s.getAuthToken(), s.getCodexHome(),
                s.getSelectedModel(), s.getCodexReasoningEffort(), s.getCodexSpeed(),
                s.getExecutionPolicy(), s.getConsultEvidenceSystems(),
                s.getStatus().name(), s.getStartedAt(), s.getLastSeenAt());
    }

    /**
     * 切 agent：更新当前引擎 + 追加引擎有序列 + 设当前 sdk_session_id（切回为目标引擎旧句柄、首次为 null）
     * + 持久化各引擎句柄映射 JSON。
     */
    public void switchEngine(String id, String engine, String engines, String sdkSessionId, String engineSessions) {
        jdbc.update(
                "UPDATE claude_chat_session SET engine = ?, engines = ?, sdk_session_id = ?, engine_sessions = ? WHERE id = ?",
                engine, engines, sdkSessionId, engineSessions, id);
    }

    /** 更新各引擎句柄映射 JSON（init 拿到新句柄时刷新）。 */
    public void updateEngineSessions(String id, String engineSessions) {
        jdbc.update("UPDATE claude_chat_session SET engine_sessions = ? WHERE id = ?", engineSessions, id);
    }

    /** 刷新 last_seen_at 与状态 */
    public void touch(String id, SessionStatus status, long lastSeenAt) {
        jdbc.update(
                "UPDATE claude_chat_session SET status = ?, last_seen_at = ? WHERE id = ?",
                status.name(), lastSeenAt, id);
    }

    /** 会话内切服务商：更新第三方网关 baseUrl + token（空＝切回官方）。sdk_session_id 不动，沿用原生会话。 */
    public void updateProvider(String id, String apiBaseUrl, String authToken) {
        jdbc.update(
                "UPDATE claude_chat_session SET api_base_url = ?, auth_token = ? WHERE id = ?",
                apiBaseUrl, authToken, id);
    }

    /** 保存会话选择的模型。 */
    public void updateSelectedModel(String id, String model) {
        jdbc.update("UPDATE claude_chat_session SET selected_model = ? WHERE id = ?", model, id);
    }

    /** 保存 Codex 推理强度与速度。 */
    public void updateCodexOptions(String id, String reasoningEffort, String speed) {
        jdbc.update(
                "UPDATE claude_chat_session SET codex_reasoning_effort = ?, codex_speed = ? WHERE id = ?",
                reasoningEffort, speed, id);
    }

    /** 评审会话的服务端安全归一化；旧评审空间恢复时也必须清掉来源会话遗留的可变配置。 */
    public void normalizeReviewConfiguration(String id, String codexHome) {
        jdbc.update("""
                UPDATE claude_chat_session
                SET engine = 'codex', engines = 'codex', api_base_url = NULL, auth_token = NULL,
                    codex_home = ?, selected_model = NULL, codex_reasoning_effort = NULL,
                    codex_speed = 'default', execution_policy = ?
                WHERE id = ?
                """, codexHome, "review-only", id);
    }

    public void updateSdkSessionId(String id, String sdkSessionId) {
        jdbc.update(
                "UPDATE claude_chat_session SET sdk_session_id = ? WHERE id = ?",
                sdkSessionId, id);
    }

    public void updateTitle(String id, String title) {
        jdbc.update("UPDATE claude_chat_session SET title = ? WHERE id = ?", title, id);
    }

    /** 设/清两级会话分组（一级=系统/项目，二级=需求；一级为空时二级必须同时清空）。 */
    public void updateGroup(String id, String groupName, String subgroupName) {
        jdbc.update("UPDATE claude_chat_session SET group_name = ?, subgroup_name = ? WHERE id = ?",
                groupName, groupName == null ? null : subgroupName, id);
    }

    /** 判断是否至少存在一个属于指定项目的会话。 */
    public boolean groupExists(String groupName) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(1) FROM claude_chat_session WHERE group_name = ?", Integer.class, groupName);
        return count != null && count > 0;
    }

    /** 批量重命名项目，保留每个会话原有的需求子分组。 */
    public int renameGroup(String oldName, String newName) {
        return jdbc.update("UPDATE claude_chat_session SET group_name = ? WHERE group_name = ?", newName, oldName);
    }

    /** 收藏或取消收藏会话，返回是否命中记录。 */
    public boolean updateFavorite(String id, boolean favorite) {
        return jdbc.update("UPDATE claude_chat_session SET favorite = ? WHERE id = ?", favorite ? 1 : 0, id) > 0;
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM claude_chat_queued_message WHERE session_id = ?", id);
        jdbc.update("DELETE FROM claude_chat_pending_sql_target WHERE session_id = ?", id);
        jdbc.update("DELETE FROM claude_chat_pending_sql WHERE session_id = ?", id);
        jdbc.update("DELETE FROM claude_chat_session_plan_state WHERE id = ?", id);
        jdbc.update("DELETE FROM claude_chat_session WHERE id = ?", id);
    }
}
