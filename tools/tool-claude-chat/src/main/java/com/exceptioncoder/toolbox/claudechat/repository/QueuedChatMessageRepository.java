package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.QueuedChatMessage;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** 待发送消息队列的 SQLite 持久化。 */
@Repository
public class QueuedChatMessageRepository {

    private static final TypeReference<List<QueuedChatMessage.Attachment>> ATTACHMENT_LIST = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public QueuedChatMessageRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public List<QueuedChatMessage> findBySessionId(String sessionId) {
        return jdbc.query("""
                SELECT id, session_id, text, display_text, developer_instructions, attachments_json, created_at,
                       server_context
                  FROM claude_chat_queued_message
                 WHERE session_id = ?
                 ORDER BY created_at, id
                """, (rs, rowNum) -> new QueuedChatMessage(
                rs.getString("id"),
                rs.getString("session_id"),
                rs.getString("text"),
                rs.getString("display_text"),
                rs.getString("developer_instructions"),
                readAttachments(rs.getString("attachments_json")),
                rs.getLong("created_at"), rs.getString("server_context")), sessionId);
    }

    public boolean hasPendingMessages() {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM claude_chat_queued_message LIMIT 1)", Boolean.class));
    }

    public Optional<QueuedChatMessage> findFirstBySessionId(String sessionId) {
        List<QueuedChatMessage> messages = jdbc.query("""
                SELECT id, session_id, text, display_text, developer_instructions, attachments_json, created_at,
                       server_context
                  FROM claude_chat_queued_message
                 WHERE session_id = ?
                 ORDER BY created_at, id
                 LIMIT 1
                """, (rs, rowNum) -> new QueuedChatMessage(
                rs.getString("id"), rs.getString("session_id"), rs.getString("text"),
                rs.getString("display_text"), rs.getString("developer_instructions"),
                readAttachments(rs.getString("attachments_json")), rs.getLong("created_at"),
                rs.getString("server_context")), sessionId);
        return messages.stream().findFirst();
    }

    public void upsert(QueuedChatMessage message) {
        int changed = jdbc.update("""
                INSERT INTO claude_chat_queued_message
                    (id, session_id, text, display_text, developer_instructions, attachments_json, created_at,
                     server_context)
                SELECT ?, ?, ?, ?, ?, ?, ?, ?
                WHERE NOT EXISTS (SELECT 1 FROM claude_chat_queue_retirement WHERE session_id=? AND message_id=?)
                ON CONFLICT(id) DO UPDATE SET
                    session_id = excluded.session_id,
                    text = excluded.text,
                    display_text = excluded.display_text,
                    developer_instructions = excluded.developer_instructions,
                    attachments_json = excluded.attachments_json,
                    server_context = excluded.server_context
                """,
                message.id(), message.sessionId(), message.text(), message.displayText(),
                message.developerInstructions(), writeAttachments(message.attachments()), message.createdAt(),
                message.serverContext(), message.sessionId(), message.id());
        if (changed == 0) throw new IllegalStateException("此队列消息已撤回，不能恢复；请使用新消息重新登记");
    }

    @org.springframework.transaction.annotation.Transactional
    public boolean delete(String sessionId, String messageId) {
        jdbc.update("INSERT OR IGNORE INTO claude_chat_queue_retirement(session_id,message_id,retired_at) VALUES(?,?,?)",
                sessionId, messageId, System.currentTimeMillis());
        return jdbc.update("DELETE FROM claude_chat_queued_message WHERE session_id = ? AND id = ?",
                sessionId, messageId) > 0;
    }

    public void deleteBySessionId(String sessionId) {
        jdbc.update("DELETE FROM claude_chat_queued_message WHERE session_id = ?", sessionId);
    }

    private List<QueuedChatMessage.Attachment> readAttachments(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, ATTACHMENT_LIST);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("待发送消息附件数据损坏", e);
        }
    }

    private String writeAttachments(List<QueuedChatMessage.Attachment> attachments) {
        if (attachments == null || attachments.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(attachments);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("待发送消息附件序列化失败", e);
        }
    }
}
