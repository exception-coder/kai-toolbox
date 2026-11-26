package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;

/** 原文先落盘再派发；同一消息 ID 永不自动重放。 */
@Repository
public class ChatSubmissionRepository {
    public record Submission(String id, String sessionId, String text,
            List<ClientMessage.Send.Attachment> attachments, String status, String note, long createdAt) { }
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public ChatSubmissionRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }
    public boolean accept(String sessionId, ClientMessage.Send message) {
        try {
            return jdbc.update("""
                    INSERT INTO claude_chat_submission(session_id,id,text,attachments_json,status,created_at)
                    VALUES (?,?,?,?,'RECEIVED',?) ON CONFLICT(session_id,id) DO NOTHING
                    """, sessionId, message.messageId(), message.text() == null ? "" : message.text(),
                    mapper.writeValueAsString(message.attachments() == null ? List.of() : message.attachments()),
                    System.currentTimeMillis()) == 1;
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
            throw new IllegalArgumentException("消息附件无法保存", error);
        }
    }
    public List<Submission> list(String sessionId) {
        return jdbc.query("""
                SELECT id,session_id,text,attachments_json,status,note,created_at
                FROM claude_chat_submission WHERE session_id=? ORDER BY created_at DESC,id LIMIT 100
                """, (rs, row) -> {
            try {
                return new Submission(rs.getString("id"), rs.getString("session_id"), rs.getString("text"),
                        mapper.readValue(rs.getString("attachments_json"), new TypeReference<>() { }),
                        rs.getString("status"), rs.getString("note"), rs.getLong("created_at"));
            } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
                throw new java.sql.SQLException("消息附件记录无法读取", error);
            }
        }, sessionId);
    }
    public void dispatched(String sessionId, String id, String turnId) {
        jdbc.update("""
                UPDATE claude_chat_submission SET status='DISPATCHED',turn_id=?,note=NULL
                WHERE session_id=? AND id=? AND (status IN ('RECEIVED','QUEUED') OR (status='FAILED' AND turn_id=?))
                """, turnId, sessionId, id, turnId);
    }
    public void queued(String sessionId, String id) {
        jdbc.update("UPDATE claude_chat_submission SET status='QUEUED',note=NULL WHERE session_id=? AND id=? AND status='RECEIVED'", sessionId, id);
    }
    public void cancelQueued(String sessionId, String id, String note) {
        jdbc.update("UPDATE claude_chat_submission SET status='FAILED',note=? WHERE session_id=? AND id=? AND status='QUEUED'", note, sessionId, id);
    }
    public void failed(String sessionId, String id, String note) {
        jdbc.update("UPDATE claude_chat_submission SET status='FAILED',note=? WHERE session_id=? AND id=? AND status='RECEIVED'",
                note, sessionId, id);
    }
    public void settled(String sessionId, String turnId, boolean success, String note) {
        jdbc.update("UPDATE claude_chat_submission SET status=?,note=? WHERE session_id=? AND turn_id=? AND status IN ('DISPATCHED','UNKNOWN')",
                success ? "COMPLETED" : "FAILED", note, sessionId, turnId);
    }
    /** 重启无法证明旧引擎是否执行，不自动补发。 */
    public void markUncertainAfterRestart() {
        jdbc.update("UPDATE claude_chat_submission SET status='UNKNOWN',note='服务已重启，请核对会话回复和运行状态后再决定是否重发' WHERE status IN ('RECEIVED','DISPATCHED')");
    }
}
