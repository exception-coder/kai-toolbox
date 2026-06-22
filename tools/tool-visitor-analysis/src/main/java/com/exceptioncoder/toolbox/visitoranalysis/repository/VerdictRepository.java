package com.exceptioncoder.toolbox.visitoranalysis.repository;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.VerdictView;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;

/** 判别结果仓储（系统真相）。列表时 LEFT JOIN 访客台账补 name/company。 */
@Repository
public class VerdictRepository {

    private static final RowMapper<VerdictView> MAPPER = (rs, n) -> new VerdictView(
            rs.getLong("id"),
            // SQLite JDBC 对小整数返回 Integer 而非 Long，直接强转会 ClassCastException；统一过 Number 兜底
            longOrNull(rs, "visitor_id"),
            rs.getString("name"),
            rs.getString("company"),
            rs.getString("identity"),
            rs.getString("relationship"),
            rs.getDouble("confidence"),
            rs.getString("decided_by"),
            rs.getString("rationale"),
            rs.getString("evidence_json"),
            rs.getString("model"),
            rs.getInt("needs_review") == 1,
            rs.getLong("created_at"));

    /** 可空整数列安全读取：SQLite 小整数走 Integer，统一过 Number 转 Long，避免强转异常。 */
    private static Long longOrNull(java.sql.ResultSet rs, String col) throws java.sql.SQLException {
        Object v = rs.getObject(col);
        return v == null ? null : ((Number) v).longValue();
    }

    private final JdbcTemplate jdbc;

    public VerdictRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long insert(Long visitorId, String identity, String relationship, double confidence,
                       String decidedBy, String rationale, String evidenceJson, String model,
                       boolean needsReview) {
        KeyHolder kh = new GeneratedKeyHolder();
        long now = System.currentTimeMillis();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO va_verdict
                      (visitor_id, identity, relationship, confidence, decided_by, rationale, evidence_json, model, needs_review, created_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                    """, Statement.RETURN_GENERATED_KEYS);
            if (visitorId == null) ps.setNull(1, java.sql.Types.INTEGER); else ps.setLong(1, visitorId);
            ps.setString(2, identity);
            ps.setString(3, relationship);
            ps.setDouble(4, confidence);
            ps.setString(5, decidedBy);
            ps.setString(6, rationale);
            ps.setString(7, evidenceJson);
            ps.setString(8, model);
            ps.setInt(9, needsReview ? 1 : 0);
            ps.setLong(10, now);
            return ps;
        }, kh);
        Number key = kh.getKey();
        return key == null ? -1L : key.longValue();
    }

    private static final String SELECT_JOIN = """
            SELECT v.id, v.visitor_id, vi.name, vi.company, v.identity, v.relationship,
                   v.confidence, v.decided_by, v.rationale, v.evidence_json, v.model,
                   v.needs_review, v.created_at
            FROM va_verdict v
            LEFT JOIN va_visitor vi ON vi.id = v.visitor_id
            """;

    public VerdictView findById(long id) {
        List<VerdictView> rows = jdbc.query(SELECT_JOIN + " WHERE v.id = ?", MAPPER, id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public List<VerdictView> listRecent(int limit) {
        return jdbc.query(SELECT_JOIN + " ORDER BY v.created_at DESC LIMIT ?", MAPPER, limit);
    }

    public List<VerdictView> listNeedsReview() {
        return jdbc.query(SELECT_JOIN + " WHERE v.needs_review = 1 ORDER BY v.created_at DESC", MAPPER);
    }

    public void clearReview(long verdictId) {
        jdbc.update("UPDATE va_verdict SET needs_review = 0 WHERE id = ?", verdictId);
    }
}
