package com.exceptioncoder.toolbox.foreconsult.suggestion;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.UUID;

/** 咨询建议是模块自己的待评审记录，不复制到待执行需求池。 */
@Repository
public class ConsultSuggestionRepository {
    private static final String COLUMNS = "id, original, title, problem, expected, acceptance, created_at";
    private static final RowMapper<ConsultSuggestion> ROW = (rs, index) -> new ConsultSuggestion(
            rs.getString("id"), rs.getString("original"), rs.getString("title"), rs.getString("problem"),
            rs.getString("expected"), rs.getString("acceptance"), rs.getLong("created_at"));
    private final JdbcTemplate jdbc;

    public ConsultSuggestionRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public ConsultSuggestion.Page list(int limit, int offset) {
        var items = jdbc.query("SELECT " + COLUMNS + " FROM consult_suggestion ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?", ROW, limit, offset);
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM consult_suggestion", Long.class);
        return new ConsultSuggestion.Page(items, total == null ? 0 : total);
    }

    public Optional<ConsultSuggestion> find(long userId, String requestId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM consult_suggestion WHERE user_id = ? AND request_id = ?",
                ROW, userId, requestId).stream().findFirst();
    }

    public void insert(long userId, ConsultSuggestion.Submit request) {
        var draft = request.draft();
        jdbc.update("INSERT INTO consult_suggestion (id, user_id, request_id, original, title, problem, expected, acceptance, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, request_id) DO NOTHING",
                UUID.randomUUID().toString(), userId, request.requestId(), request.original(), draft.title(),
                draft.problem(), draft.expected(), draft.acceptance(), System.currentTimeMillis());
    }
}
