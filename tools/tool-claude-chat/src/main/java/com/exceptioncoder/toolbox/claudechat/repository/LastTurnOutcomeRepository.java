package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.api.dto.LastTurnFailure;
import com.exceptioncoder.toolbox.claudechat.api.dto.TurnFailure;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;

/** 每会话只保留最近轮次摘要；旧轮次迟到结果不能覆盖新轮次。 */
@Repository
public class LastTurnOutcomeRepository {
    private final JdbcTemplate jdbc;
    public LastTurnOutcomeRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void begin(String sessionId, String turnId) {
        jdbc.update("""
            INSERT INTO claude_chat_last_outcome(session_id,turn_id) VALUES(?,?)
            ON CONFLICT(session_id) DO UPDATE SET turn_id=excluded.turn_id,ended_at=NULL,category=NULL,code=NULL
            """, sessionId, turnId);
    }

    public void finish(String sessionId, String turnId, TurnFailure failure) {
        jdbc.update("""
            UPDATE claude_chat_last_outcome SET ended_at=?,category=?,code=?
            WHERE session_id=? AND turn_id=? AND ended_at IS NULL
            """, System.currentTimeMillis(), failure == null ? null : failure.category(),
                failure == null ? null : failure.code(), sessionId, turnId);
    }

    public Optional<LastTurnFailure> failure(String sessionId) {
        return jdbc.query("""
            SELECT turn_id,ended_at,category,code FROM claude_chat_last_outcome
            WHERE session_id=? AND category IS NOT NULL AND ended_at IS NOT NULL
            """, (rs, i) -> new LastTurnFailure(rs.getString(1), rs.getLong(2),
                new TurnFailure(rs.getString(3), rs.getString(4))), sessionId).stream().findFirst();
    }
}
