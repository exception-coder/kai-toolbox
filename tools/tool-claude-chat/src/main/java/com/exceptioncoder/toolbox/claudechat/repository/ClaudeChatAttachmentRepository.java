package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatAttachment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** 持久化附件元数据以及服务端 turn 与附件的稳定关联。 */
@Repository
public class ClaudeChatAttachmentRepository {

    private final JdbcTemplate jdbc;

    public ClaudeChatAttachmentRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(ClaudeChatAttachment attachment) {
        jdbc.update("""
                INSERT INTO claude_chat_attachment
                  (id, session_id, name, mime, size_bytes, storage_path, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, attachment.id(), attachment.sessionId(), attachment.name(), attachment.mime(),
                attachment.size(), attachment.storagePath(), attachment.createdAt());
    }

    public Optional<ClaudeChatAttachment> find(String sessionId, String attachmentId) {
        return jdbc.query("""
                SELECT id, session_id, name, mime, size_bytes, storage_path, created_at
                FROM claude_chat_attachment WHERE session_id = ? AND id = ?
                """, (rs, row) -> new ClaudeChatAttachment(
                rs.getString("id"), rs.getString("session_id"), rs.getString("name"),
                rs.getString("mime"), rs.getLong("size_bytes"), rs.getString("storage_path"),
                rs.getLong("created_at")), sessionId, attachmentId).stream().findFirst();
    }

    public void bindTurn(String sessionId, String turnId, List<String> attachmentIds) {
        if (attachmentIds == null || attachmentIds.isEmpty()) return;
        long now = System.currentTimeMillis();
        for (String attachmentId : attachmentIds) {
            jdbc.update("""
                    INSERT OR IGNORE INTO claude_chat_turn_attachment
                      (session_id, turn_id, attachment_id, created_at)
                    SELECT ?, ?, id, ? FROM claude_chat_attachment
                    WHERE session_id = ? AND id = ?
                    """, sessionId, turnId, now, sessionId, attachmentId);
        }
    }

    public Map<String, List<ClaudeChatAttachment>> findByTurns(String sessionId, List<String> turnIds) {
        if (turnIds == null || turnIds.isEmpty()) return Map.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(turnIds.size(), "?"));
        Object[] args = new Object[turnIds.size() + 1];
        args[0] = sessionId;
        for (int index = 0; index < turnIds.size(); index++) args[index + 1] = turnIds.get(index);
        Map<String, List<ClaudeChatAttachment>> result = new LinkedHashMap<>();
        jdbc.query("""
                SELECT ta.turn_id, a.id, a.session_id, a.name, a.mime, a.size_bytes,
                       a.storage_path, a.created_at
                FROM claude_chat_turn_attachment ta
                JOIN claude_chat_attachment a ON a.id = ta.attachment_id
                WHERE ta.session_id = ? AND ta.turn_id IN (%s)
                ORDER BY ta.created_at, a.id
                """.formatted(placeholders), rs -> {
            ClaudeChatAttachment attachment = new ClaudeChatAttachment(
                    rs.getString("id"), rs.getString("session_id"), rs.getString("name"),
                    rs.getString("mime"), rs.getLong("size_bytes"), rs.getString("storage_path"),
                    rs.getLong("created_at"));
            result.computeIfAbsent(rs.getString("turn_id"), ignored -> new java.util.ArrayList<>())
                    .add(attachment);
        }, args);
        return Map.copyOf(result);
    }

    public void deleteBySession(String sessionId) {
        jdbc.update("DELETE FROM claude_chat_turn_attachment WHERE session_id = ?", sessionId);
        jdbc.update("DELETE FROM claude_chat_attachment WHERE session_id = ?", sessionId);
    }
}
