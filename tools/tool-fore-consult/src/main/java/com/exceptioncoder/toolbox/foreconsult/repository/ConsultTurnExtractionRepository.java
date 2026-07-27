package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurnExtraction;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class ConsultTurnExtractionRepository {

    private static final RowMapper<ConsultTurnExtraction> ROW = (rs, i) -> {
        int isBug = rs.getInt("is_bug");
        boolean isBugNull = rs.wasNull();
        int pv = rs.getInt("prompt_version");
        boolean pvNull = rs.wasNull();
        return ConsultTurnExtraction.builder()
                .sessionId(rs.getString("session_id"))
                .turnIndex(rs.getInt("turn_index"))
                .answerHash(rs.getString("answer_hash"))
                .status(rs.getString("status"))
                .isBug(isBugNull ? null : isBug == 1)
                .bugId(rs.getString("bug_id"))
                .promptVersion(pvNull ? null : pv)
                .raw(rs.getString("raw"))
                .error(rs.getString("error"))
                .extractedAt(rs.getLong("extracted_at"))
                .build();
    };

    private final JdbcTemplate jdbc;

    public ConsultTurnExtractionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<ConsultTurnExtraction> find(String sessionId, int turnIndex) {
        List<ConsultTurnExtraction> rows = jdbc.query(
                "SELECT * FROM consult_turn_extraction WHERE session_id=? AND turn_index=?",
                ROW, sessionId, turnIndex);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<ConsultTurnExtraction> findBySession(String sessionId) {
        return jdbc.query("SELECT * FROM consult_turn_extraction WHERE session_id=? ORDER BY turn_index ASC",
                ROW, sessionId);
    }

    /** 整行覆盖写入：同一轮重抽时以最后一次结果为准。 */
    public void upsert(ConsultTurnExtraction e) {
        jdbc.update("INSERT OR REPLACE INTO consult_turn_extraction "
                        + "(session_id, turn_index, answer_hash, status, is_bug, bug_id, prompt_version, raw, error, extracted_at) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?)",
                e.getSessionId(), e.getTurnIndex(), e.getAnswerHash(), e.getStatus(),
                e.getIsBug() == null ? null : (e.getIsBug() ? 1 : 0),
                e.getBugId(), e.getPromptVersion(), e.getRaw(), e.getError(), e.getExtractedAt());
    }

    public void deleteBySession(String sessionId) {
        jdbc.update("DELETE FROM consult_turn_extraction WHERE session_id=?", sessionId);
    }
}
