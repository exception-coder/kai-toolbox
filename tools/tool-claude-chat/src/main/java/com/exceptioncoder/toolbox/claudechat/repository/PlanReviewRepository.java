package com.exceptioncoder.toolbox.claudechat.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

/** 批次内子任务由服务短临界区更新；唯一键负责请求身份。 */
@Repository
public class PlanReviewRepository {
    private final JdbcTemplate jdbc;
    public PlanReviewRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public Optional<String> find(String sessionId, String id) {
        return jdbc.query("SELECT state_json FROM claude_chat_plan_review WHERE session_id=? AND id=?",
                (rs, row) -> rs.getString(1), sessionId, id).stream().findFirst();
    }
    public List<String> list(String sessionId) {
        return jdbc.query("SELECT state_json FROM claude_chat_plan_review WHERE session_id=? ORDER BY created_at DESC",
                (rs, row) -> rs.getString(1), sessionId);
    }
    public void insert(String sessionId, String id, long createdAt, String json) {
        jdbc.update("INSERT INTO claude_chat_plan_review(session_id,id,created_at,state_json) VALUES (?,?,?,?)",
                sessionId, id, createdAt, json);
    }
    public void update(String sessionId, String id, String json) {
        jdbc.update("UPDATE claude_chat_plan_review SET state_json=? WHERE session_id=? AND id=?", json, sessionId, id);
    }
}
