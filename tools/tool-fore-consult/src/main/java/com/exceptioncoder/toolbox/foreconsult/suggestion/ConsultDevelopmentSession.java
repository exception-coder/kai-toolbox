package com.exceptioncoder.toolbox.foreconsult.suggestion;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;

/** 清单专属开发会话，复用现有模型执行器；持久记录宿主动作及真实引擎回执，不冒充Forge监督会话。 */
@Repository
public class ConsultDevelopmentSession {
    public static final String ID = "consult-suggestion-development";
    private final JdbcTemplate jdbc;
    public ConsultDevelopmentSession(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public record Message(long sequence, String suggestionId, String phase, String content, long createdAt) { }
    public record View(String id, String title, List<Message> messages, boolean hasMore, long nextBefore) { }

    public void append(String suggestionId, String phase, String content) { append(suggestionId, phase, content, null); }
    public void append(String suggestionId, String phase, String content, String engineSessionId) {
        jdbc.update("INSERT INTO consult_development_session(id,title,created_at) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING",
                ID, "业务咨询需求 · 后台开发会话", System.currentTimeMillis());
        jdbc.update("INSERT INTO consult_development_message(session_id,suggestion_id,phase,content,engine_session_id,created_at) VALUES (?,?,?,?,?,?)",
                ID, suggestionId, phase, content, engineSessionId, System.currentTimeMillis());
    }

    public View read(long before) {
        if (before < 0) throw new IllegalArgumentException("会话游标无效");
        var titles = jdbc.queryForList("SELECT title FROM consult_development_session WHERE id=?", String.class, ID);
        var messages = jdbc.query("SELECT sequence,suggestion_id,phase,content,created_at FROM consult_development_message WHERE session_id=? AND sequence<? ORDER BY sequence DESC LIMIT 51",
                (rs, index) -> new Message(rs.getLong("sequence"), rs.getString("suggestion_id"), rs.getString("phase"), rs.getString("content"), rs.getLong("created_at")), ID, before == 0 ? Long.MAX_VALUE : before);
        boolean more = messages.size() > 50;
        List<Message> page = more ? List.copyOf(messages.subList(0, 50)) : messages;
        return new View(titles.isEmpty() ? null : ID, titles.isEmpty() ? "业务咨询需求 · 后台开发会话" : titles.getFirst(), page, more,
                page.isEmpty() ? before : page.getLast().sequence());
    }
}
