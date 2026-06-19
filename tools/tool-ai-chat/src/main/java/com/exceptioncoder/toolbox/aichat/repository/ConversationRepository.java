package com.exceptioncoder.toolbox.aichat.repository;

import com.exceptioncoder.toolbox.aichat.domain.Conversation;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class ConversationRepository {

    private final JdbcTemplate jdbc;

    public ConversationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Conversation> ROW = (rs, i) -> Conversation.builder()
            .id(rs.getString("id"))
            .title(rs.getString("title"))
            .model(rs.getString("model"))
            .kind(rs.getString("kind"))
            .systemPrompt(rs.getString("system_prompt"))
            .temperature((Double) rs.getObject("temperature"))
            .maxTokens((Integer) rs.getObject("max_tokens"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public List<Conversation> findAllOrderByUpdatedDesc() {
        return jdbc.query("SELECT * FROM ai_chat_conversation ORDER BY updated_at DESC", ROW);
    }

    /** 按会话类型(chat/image/video)过滤,按更新时间倒序。 */
    public List<Conversation> findByKindOrderByUpdatedDesc(String kind) {
        return jdbc.query("SELECT * FROM ai_chat_conversation WHERE kind = ? ORDER BY updated_at DESC", ROW, kind);
    }

    public Optional<Conversation> findById(String id) {
        return jdbc.query("SELECT * FROM ai_chat_conversation WHERE id = ?", ROW, id)
                .stream().findFirst();
    }

    public void insert(Conversation c) {
        jdbc.update("""
                INSERT INTO ai_chat_conversation
                  (id, title, model, kind, system_prompt, temperature, max_tokens, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                c.getId(), c.getTitle(), c.getModel(), c.getKind(), c.getSystemPrompt(),
                c.getTemperature(), c.getMaxTokens(), c.getCreatedAt(), c.getUpdatedAt());
    }

    /** 全字段更新（含 updated_at）。调用方负责把 updated_at 设为当前时间。 */
    public void update(Conversation c) {
        jdbc.update("""
                UPDATE ai_chat_conversation
                   SET title = ?, model = ?, system_prompt = ?, temperature = ?, max_tokens = ?, updated_at = ?
                 WHERE id = ?
                """,
                c.getTitle(), c.getModel(), c.getSystemPrompt(), c.getTemperature(),
                c.getMaxTokens(), c.getUpdatedAt(), c.getId());
    }

    public void touchUpdatedAt(String id, long updatedAt) {
        jdbc.update("UPDATE ai_chat_conversation SET updated_at = ? WHERE id = ?", updatedAt, id);
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM ai_chat_conversation WHERE id = ?", id);
    }
}
