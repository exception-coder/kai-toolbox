package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

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
            .cwd(rs.getString("cwd"))
            .title(rs.getString("title"))
            .sdkSessionId(rs.getString("sdk_session_id"))
            .engine(rs.getString("engine") == null ? "claude" : rs.getString("engine"))
            .engines(rs.getString("engines"))
            .engineSessions(rs.getString("engine_sessions"))
            .status(SessionStatus.valueOf(rs.getString("status")))
            .startedAt(rs.getLong("started_at"))
            .lastSeenAt(rs.getLong("last_seen_at"))
            .build();

    public List<ClaudeChatSession> findAll() {
        return jdbc.query(
                "SELECT * FROM claude_chat_session ORDER BY last_seen_at DESC",
                ROW);
    }

    public Optional<ClaudeChatSession> findById(String id) {
        return jdbc.query("SELECT * FROM claude_chat_session WHERE id = ?", ROW, id)
                .stream().findFirst();
    }

    public void insert(ClaudeChatSession s) {
        String engine = s.getEngine() == null ? "claude" : s.getEngine();
        jdbc.update("""
                INSERT INTO claude_chat_session
                  (id, cwd, title, sdk_session_id, engine, engines, status, started_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                s.getId(), s.getCwd(), s.getTitle(), s.getSdkSessionId(),
                engine, s.getEngines() == null ? engine : s.getEngines(),
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

    public void updateSdkSessionId(String id, String sdkSessionId) {
        jdbc.update(
                "UPDATE claude_chat_session SET sdk_session_id = ? WHERE id = ?",
                sdkSessionId, id);
    }

    public void updateTitle(String id, String title) {
        jdbc.update("UPDATE claude_chat_session SET title = ? WHERE id = ?", title, id);
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM claude_chat_session WHERE id = ?", id);
    }
}
