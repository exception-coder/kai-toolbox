package com.exceptioncoder.toolbox.foreconsult.suggestion;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.UUID;

/** 咨询建议及其审核结果由本模块持有，审核通过后经公共端口登记执行需求。 */
@Repository
public class ConsultSuggestionRepository {
    private static final String COLUMNS = "s.id, s.original, s.title, s.problem, s.expected, s.acceptance, s.created_at, "
            + "COALESCE(w.state,'PENDING_REVIEW') AS state, COALESCE(w.reason,'') AS reason, w.requirement_id, w.commit_hash";
    private static final String FROM = " FROM consult_suggestion s LEFT JOIN consult_suggestion_work w ON w.suggestion_id=s.id ";
    private static final RowMapper<ConsultSuggestion> ROW = (rs, index) -> new ConsultSuggestion(
            rs.getString("id"), rs.getString("original"), rs.getString("title"), rs.getString("problem"),
            rs.getString("expected"), rs.getString("acceptance"), rs.getLong("created_at"),
            rs.getString("state"), rs.getString("reason"), rs.getString("requirement_id"), rs.getString("commit_hash"));
    private final JdbcTemplate jdbc;

    public ConsultSuggestionRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public ConsultSuggestion.Page list(int limit, int offset) {
        var items = jdbc.query("SELECT " + COLUMNS + FROM + " ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?", ROW, limit, offset);
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM consult_suggestion", Long.class);
        return new ConsultSuggestion.Page(items, total == null ? 0 : total);
    }

    public Optional<ConsultSuggestion> find(long userId, String requestId) {
        return jdbc.query("SELECT " + COLUMNS + FROM + " WHERE s.user_id = ? AND s.request_id = ?",
                ROW, userId, requestId).stream().findFirst();
    }

    public Optional<ConsultSuggestion> findById(String id) {
        return jdbc.query("SELECT " + COLUMNS + FROM + " WHERE s.id=?", ROW, id).stream().findFirst();
    }

    public boolean insert(long userId, ConsultSuggestion.Submit request) {
        var draft = request.draft();
        return jdbc.update("INSERT INTO consult_suggestion (id, user_id, request_id, original, title, problem, expected, acceptance, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, request_id) DO NOTHING",
                UUID.randomUUID().toString(), userId, request.requestId(), request.original(), draft.title(),
                draft.problem(), draft.expected(), draft.acceptance(), System.currentTimeMillis()) == 1;
    }
}
