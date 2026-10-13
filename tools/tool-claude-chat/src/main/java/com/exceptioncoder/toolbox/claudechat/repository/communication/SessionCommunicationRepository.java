package com.exceptioncoder.toolbox.claudechat.repository.communication;

import com.exceptioncoder.toolbox.claudechat.domain.communication.CommunicationRecord;
import com.exceptioncoder.toolbox.claudechat.domain.communication.CommunicationRecord.Filter;
import com.exceptioncoder.toolbox.claudechat.domain.communication.CommunicationRecord.Input;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

/** 所有检索和写入都携带服务器会话 ID；列表只读短摘要。 */
@Repository("claudeChatSessionCommunicationRepository")
public class SessionCommunicationRepository {
    public static final int PAGE_SIZE = 20;
    public static final int MAX_RECORDS = 1000;
    private static final String COLUMNS = """
            id, session_id, title, occurred_at, source, participants, source_url,
            original_text, notes, attachment_ids, version, deleted_at, created_at, updated_at
            """;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final RowMapper<CommunicationRecord> rowMapper;

    public SessionCommunicationRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.rowMapper = (rs, row) -> new CommunicationRecord(rs.getString("id"), rs.getString("session_id"),
                rs.getString("title"), rs.getLong("occurred_at"), rs.getString("source"),
                rs.getString("participants"), rs.getString("source_url"), rs.getString("original_text"),
                rs.getString("notes"), readIds(rs.getString("attachment_ids")), rs.getInt("version"),
                rs.getObject("deleted_at") == null ? null : rs.getLong("deleted_at"),
                rs.getLong("created_at"), rs.getLong("updated_at"));
    }

    public Optional<CommunicationRecord> find(String sessionId, String id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM claude_chat_communication_record WHERE session_id = ? AND id = ?",
                rowMapper, sessionId, id).stream().findFirst();
    }

    public List<CommunicationRecord> findMany(String sessionId, List<String> ids) {
        if (ids.isEmpty()) return List.of();
        String placeholders = String.join(",", Collections.nCopies(ids.size(), "?"));
        Object[] args = new Object[ids.size() + 1];
        args[0] = sessionId;
        for (int i = 0; i < ids.size(); i++) args[i + 1] = ids.get(i);
        return jdbc.query("SELECT " + COLUMNS + " FROM claude_chat_communication_record WHERE session_id = ? AND id IN ("
                + placeholders + ") AND deleted_at IS NULL", rowMapper, args);
    }

    public int count(String sessionId, Filter filter) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM claude_chat_communication_record WHERE " + where(filter),
                Integer.class, args(sessionId, filter));
    }

    public List<CommunicationRecord> list(String sessionId, Filter filter) {
        String projection = COLUMNS.replace("original_text, notes,", "substr(original_text, 1, 280) AS original_text, substr(notes, 1, 160) AS notes,");
        String direction = "asc".equals(filter.order()) ? "ASC" : "DESC";
        String sql = "SELECT " + projection + " FROM claude_chat_communication_record WHERE " + where(filter)
                + " ORDER BY occurred_at " + direction + ", id " + direction + " LIMIT ? OFFSET ?";
        Object[] args = java.util.Arrays.copyOf(args(sessionId, filter), 5);
        args[3] = PAGE_SIZE;
        args[4] = filter.page() * PAGE_SIZE;
        return jdbc.query(sql, rowMapper, args);
    }

    private String where(Filter filter) {
        String removed = filter.removed() ? "deleted_at IS NOT NULL" : "deleted_at IS NULL";
        String notes = switch (filter.notes()) {
            case "with" -> " AND notes <> ''";
            case "without" -> " AND notes = ''";
            default -> "";
        };
        return "session_id = ? AND " + removed + notes
                + " AND (? = '' OR instr(lower(title || char(10) || source || char(10) || participants || char(10) || original_text || char(10) || notes), lower(?)) > 0)";
    }

    private Object[] args(String sessionId, Filter filter) {
        return new Object[]{sessionId, filter.search(), filter.search()};
    }

    public boolean insert(String sessionId, String id, Input input) {
        long now = System.currentTimeMillis();
        return jdbc.update("""
                INSERT OR IGNORE INTO claude_chat_communication_record
                  (id, session_id, title, occurred_at, source, participants, source_url,
                   original_text, notes, attachment_ids, version, created_at, updated_at)
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?
                WHERE (SELECT COUNT(*) FROM claude_chat_communication_record WHERE session_id = ?) < ?
                """, id, sessionId, input.title(), input.occurredAt(), input.source(), input.participants(),
                input.sourceUrl(), input.originalText(), input.notes(), writeIds(input.attachmentIds()), now, now,
                sessionId, MAX_RECORDS) == 1;
    }

    public boolean update(String sessionId, String id, Input input) {
        return jdbc.update("""
                UPDATE claude_chat_communication_record SET title = ?, occurred_at = ?, source = ?,
                  participants = ?, source_url = ?, original_text = ?, notes = ?, attachment_ids = ?,
                  version = version + 1, updated_at = ?
                WHERE session_id = ? AND id = ? AND version = ? AND deleted_at IS NULL
                """, input.title(), input.occurredAt(), input.source(), input.participants(), input.sourceUrl(),
                input.originalText(), input.notes(), writeIds(input.attachmentIds()), System.currentTimeMillis(),
                sessionId, id, input.expectedVersion()) == 1;
    }

    public boolean setRemoved(String sessionId, String id, int version, boolean removed) {
        long now = System.currentTimeMillis();
        return jdbc.update("""
                UPDATE claude_chat_communication_record SET deleted_at = ?, version = version + 1, updated_at = ?
                WHERE session_id = ? AND id = ? AND version = ?
                """, removed ? now : null, now, sessionId, id, version) == 1;
    }

    public void deleteBySession(String sessionId) {
        jdbc.update("DELETE FROM claude_chat_communication_record WHERE session_id = ?", sessionId);
    }

    private List<String> readIds(String json) {
        try {
            return mapper.readValue(json, new TypeReference<>() { });
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("沟通图片关联数据不可读", exception);
        }
    }

    private String writeIds(List<String> ids) {
        try {
            return mapper.writeValueAsString(ids);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("沟通图片关联数据不能保存", exception);
        }
    }
}
