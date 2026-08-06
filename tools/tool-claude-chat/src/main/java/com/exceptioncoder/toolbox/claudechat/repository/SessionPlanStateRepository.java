package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.SessionPlanState;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 会话规划锁定状态的 SQLite 持久层。
 */
@Repository("claudeChatSessionPlanStateRepository")
public class SessionPlanStateRepository {

    private static final RowMapper<SessionPlanState> ROW_MAPPER = (resultSet, rowNumber) ->
            new SessionPlanState(
                    resultSet.getString("id"),
                    resultSet.getInt("plan_expired") == 1,
                    nullableLong(resultSet, "expired_at"),
                    nullableLong(resultSet, "unlocked_at"));

    private final JdbcTemplate jdbc;

    public SessionPlanStateRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 批量读取会话状态；没有状态行的会话由上层按未过期处理。
     *
     * @param sessionIds 逻辑会话 ID 集合
     * @return 以会话 ID 为键的状态映射
     */
    public Map<String, SessionPlanState> findBySessionIds(Collection<String> sessionIds) {
        if (sessionIds == null || sessionIds.isEmpty()) {
            return Map.of();
        }
        String placeholders = String.join(",", Collections.nCopies(sessionIds.size(), "?"));
        String sql = "SELECT id, plan_expired, expired_at, unlocked_at "
                + "FROM claude_chat_session_plan_state WHERE id IN (" + placeholders + ")";
        Map<String, SessionPlanState> states = new LinkedHashMap<>((int) (sessionIds.size() / 0.75F) + 1);
        jdbc.query(sql, ROW_MAPPER, sessionIds.toArray()).forEach(state -> states.put(state.sessionId(), state));
        return states;
    }

    /**
     * 判断指定会话是否处于规划过期状态。
     *
     * @param sessionId 逻辑会话 ID
     * @return 过期时返回 true
     */
    public boolean planExpired(String sessionId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(1) FROM claude_chat_session_plan_state WHERE id = ? AND plan_expired = 1",
                Integer.class, sessionId);
        return count != null && count > 0;
    }

    /**
     * 幂等标记规划过期并刷新最近过期时间。
     *
     * @param sessionId 逻辑会话 ID
     * @param now 当前毫秒时间戳
     */
    public void expire(String sessionId, long now) {
        jdbc.update("""
                INSERT INTO claude_chat_session_plan_state
                    (id, plan_expired, expired_at, unlocked_at, create_time, update_time)
                VALUES (?, 1, ?, NULL, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    plan_expired = 1,
                    expired_at = excluded.expired_at,
                    update_time = excluded.update_time
                """, sessionId, now, now, now);
    }

    /**
     * 幂等解除已有锁定并记录最近解锁时间。
     *
     * @param sessionId 逻辑会话 ID
     * @param now 当前毫秒时间戳
     */
    public void unlock(String sessionId, long now) {
        jdbc.update("""
                UPDATE claude_chat_session_plan_state
                SET plan_expired = 0, unlocked_at = ?, update_time = ?
                WHERE id = ?
                """, now, now, sessionId);
    }

    /** 将 SQLite 可空整数列转换为包装类型。 */
    private static Long nullableLong(java.sql.ResultSet resultSet, String column) throws java.sql.SQLException {
        long value = resultSet.getLong(column);
        return resultSet.wasNull() ? null : value;
    }
}
