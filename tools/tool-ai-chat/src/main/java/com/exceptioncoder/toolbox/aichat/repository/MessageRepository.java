package com.exceptioncoder.toolbox.aichat.repository;

import com.exceptioncoder.toolbox.aichat.domain.ChatMessage;
import com.exceptioncoder.toolbox.aichat.domain.MessageRole;
import com.exceptioncoder.toolbox.aichat.domain.MessageStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Repository
public class MessageRepository {

    private final JdbcTemplate jdbc;

    public MessageRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<ChatMessage> ROW = (rs, i) -> ChatMessage.builder()
            .id(rs.getString("id"))
            .conversationId(rs.getString("conversation_id"))
            .role(MessageRole.valueOf(rs.getString("role")))
            .content(rs.getString("content"))
            .model(rs.getString("model"))
            .attachmentsJson(rs.getString("attachments_json"))
            .status(MessageStatus.valueOf(rs.getString("status")))
            .createdAt(rs.getLong("created_at"))
            .build();

    public void insert(ChatMessage m) {
        jdbc.update("""
                INSERT INTO ai_chat_message
                  (id, conversation_id, role, content, model, attachments_json, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                m.getId(), m.getConversationId(), m.getRole().name(), m.getContent(),
                m.getModel(), m.getAttachmentsJson(), m.getStatus().name(), m.getCreatedAt());
    }

    /** 取该会话最近 limit 条，按时间升序返回（供拼上下文）。用 rowid 兜同毫秒时间戳的稳定排序。 */
    public List<ChatMessage> findRecent(String conversationId, int limit) {
        List<ChatMessage> desc = jdbc.query(
                "SELECT * FROM ai_chat_message WHERE conversation_id = ? ORDER BY rowid DESC LIMIT ?",
                ROW, conversationId, limit);
        List<ChatMessage> asc = new ArrayList<>(desc);
        Collections.reverse(asc);
        return asc;
    }

    /**
     * 历史翻页：返回 before 之前（更早）的最多 limit 条，按时间升序。
     * before 为空时返回最新 limit 条。结果首项之前是否还有更早消息由调用方据 hasMore 判断。
     */
    public List<ChatMessage> pageBefore(String conversationId, String before, int limit) {
        List<ChatMessage> desc;
        if (before == null || before.isBlank()) {
            desc = jdbc.query(
                    "SELECT * FROM ai_chat_message WHERE conversation_id = ? ORDER BY rowid DESC LIMIT ?",
                    ROW, conversationId, limit);
        } else {
            desc = jdbc.query("""
                    SELECT * FROM ai_chat_message
                     WHERE conversation_id = ?
                       AND rowid < (SELECT rowid FROM ai_chat_message WHERE id = ?)
                     ORDER BY rowid DESC LIMIT ?
                    """, ROW, conversationId, before, limit);
        }
        List<ChatMessage> asc = new ArrayList<>(desc);
        Collections.reverse(asc);
        return asc;
    }

    /** 判断 before 之前是否还有更早消息（驱动 hasMore）。 */
    public boolean hasOlderThan(String conversationId, String oldestId) {
        if (oldestId == null) {
            return false;
        }
        Integer cnt = jdbc.queryForObject("""
                SELECT COUNT(*) FROM ai_chat_message
                 WHERE conversation_id = ?
                   AND rowid < (SELECT rowid FROM ai_chat_message WHERE id = ?)
                """, Integer.class, conversationId, oldestId);
        return cnt != null && cnt > 0;
    }

    public void deleteByConversation(String conversationId) {
        jdbc.update("DELETE FROM ai_chat_message WHERE conversation_id = ?", conversationId);
    }
}
