package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.QueuedChatMessage;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

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
                SELECT id, session_id, text, display_text, developer_instructions, attachments_json, created_at
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
                rs.getLong("created_at")), sessionId);
    }

    public void upsert(QueuedChatMessage message) {
        jdbc.update("""
                INSERT INTO claude_chat_queued_message
                    (id, session_id, text, display_text, developer_instructions, attachments_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    session_id = excluded.session_id,
                    text = excluded.text,
                    display_text = excluded.display_text,
                    developer_instructions = excluded.developer_instructions,
                    attachments_json = excluded.attachments_json
                """,
                message.id(), message.sessionId(), message.text(), message.displayText(),
                message.developerInstructions(), writeAttachments(message.attachments()), message.createdAt());
    }

    public void delete(String sessionId, String messageId) {
        jdbc.update("DELETE FROM claude_chat_queued_message WHERE session_id = ? AND id = ?", sessionId, messageId);
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
