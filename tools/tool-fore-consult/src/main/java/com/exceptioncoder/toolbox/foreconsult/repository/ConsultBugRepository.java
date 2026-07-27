package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultBug;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * consult_bug 表的数据访问层。JdbcTemplate + 静态 RowMapper。
 */
@Repository
public class ConsultBugRepository {

    private static final RowMapper<ConsultBug> ROW = (rs, i) -> ConsultBug.builder()
            .bugId(rs.getString("bug_id"))
            .dedupKey(rs.getString("dedup_key"))
            .consultSessionId(rs.getString("consult_session_id"))
            .devSessionId(rs.getString("dev_session_id"))
            .systemName(rs.getString("system_name"))
            .module(rs.getString("module"))
            .role(rs.getString("role"))
            .userId(rs.getString("user_id"))
            .title(rs.getString("title"))
            .type(rs.getString("type"))
            .severity(rs.getString("severity"))
            .reproduce(rs.getString("reproduce"))
            .expected(rs.getString("expected"))
            .actual(rs.getString("actual"))
            .suspectArea(rs.getString("suspect_area"))
            .evidence(rs.getString("evidence"))
            .question(rs.getString("question"))
            .answer(rs.getString("answer"))
            .aiConfidence(rs.getObject("ai_confidence") == null ? null : rs.getInt("ai_confidence"))
            .refsJson(rs.getString("refs_json"))
            .status(rs.getString("status"))
            .occurrenceCount(rs.getInt("occurrence_count"))
            .firstSeenAt(rs.getLong("first_seen_at"))
            .lastSeenAt(rs.getLong("last_seen_at"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    private final JdbcTemplate jdbc;

    public ConsultBugRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 找未终结（未 FIXED/REJECTED/WONTFIX）的同键单，用于去重累加。 */
    public Optional<ConsultBug> findOpenByDedupKey(String dedupKey) {
        List<ConsultBug> rows = jdbc.query(
                "SELECT * FROM consult_bug WHERE dedup_key = ? AND status IN ('NEW','CONFIRMED','DUPLICATE') " +
                "ORDER BY created_at DESC LIMIT 1", ROW, dedupKey);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public Optional<ConsultBug> findById(String bugId) {
        List<ConsultBug> rows = jdbc.query("SELECT * FROM consult_bug WHERE bug_id = ?", ROW, bugId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public void insert(ConsultBug b) {
        jdbc.update(
                "INSERT INTO consult_bug (bug_id, dedup_key, consult_session_id, dev_session_id, system_name, module, " +
                "role, user_id, title, type, severity, reproduce, expected, actual, suspect_area, evidence, question, " +
                "answer, ai_confidence, refs_json, status, occurrence_count, first_seen_at, last_seen_at, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                b.getBugId(), b.getDedupKey(), b.getConsultSessionId(), b.getDevSessionId(), b.getSystemName(), b.getModule(),
                b.getRole(), b.getUserId(), b.getTitle(), b.getType(), b.getSeverity(), b.getReproduce(), b.getExpected(),
                b.getActual(), b.getSuspectArea(), b.getEvidence(), b.getQuestion(), b.getAnswer(), b.getAiConfidence(),
                b.getRefsJson(), b.getStatus(), b.getOccurrenceCount(), b.getFirstSeenAt(), b.getLastSeenAt(),
                b.getCreatedAt(), b.getUpdatedAt());
    }

    /** 去重累加：出现次数 +1，刷新 last_seen 与结论/证据。 */
    public void bumpOccurrence(String bugId, String answer, String evidence, long now) {
        jdbc.update(
                "UPDATE consult_bug SET occurrence_count = occurrence_count + 1, last_seen_at = ?, updated_at = ?, " +
                "answer = COALESCE(?, answer), evidence = COALESCE(?, evidence) WHERE bug_id = ?",
                now, now, answer, evidence, bugId);
    }

    public void updateStatus(String bugId, String status, long now) {
        jdbc.update("UPDATE consult_bug SET status = ?, updated_at = ? WHERE bug_id = ?", status, now, bugId);
    }

    public List<ConsultBug> findRecent(int limit) {
        return jdbc.query("SELECT * FROM consult_bug ORDER BY last_seen_at DESC LIMIT ?", ROW, limit);
    }

    /**
     * 按状态过滤的近期列表，statuses 为空时等价 {@link #findRecent(int)}。
     * 回捞黄金集要的是人工已裁决过的记录（CONFIRMED/REJECTED），这类通常量少且靠后，
     * 单纯按时间取前 N 条会把它们挤掉。
     */
    public List<ConsultBug> findRecentByStatus(List<String> statuses, int limit) {
        if (statuses == null || statuses.isEmpty()) {
            return findRecent(limit);
        }
        String placeholders = String.join(",", java.util.Collections.nCopies(statuses.size(), "?"));
        Object[] args = new Object[statuses.size() + 1];
        for (int i = 0; i < statuses.size(); i++) {
            args[i] = statuses.get(i);
        }
        args[statuses.size()] = limit;
        return jdbc.query(
                "SELECT * FROM consult_bug WHERE status IN (" + placeholders + ") ORDER BY last_seen_at DESC LIMIT ?",
                ROW, args);
    }

    public void delete(String bugId) {
        jdbc.update("DELETE FROM consult_bug WHERE bug_id = ?", bugId);
    }
}
