package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * consult_turn 表的数据访问层。JdbcTemplate + 静态 RowMapper，与其他工具模块保持一致。
 */
@Repository
public class ConsultTurnRepository {

    private static final RowMapper<ConsultTurn> ROW = (rs, i) -> ConsultTurn.builder()
            .turnId(rs.getString("turn_id"))
            .sessionId(rs.getString("session_id"))
            .turnIndex(rs.getInt("turn_index"))
            .question(rs.getString("question"))
            .answer(rs.getString("answer"))
            .refMenuPaths(rs.getString("ref_menu_paths"))
            .refGraphifyNodes(rs.getString("ref_graphify_nodes"))
            .refDomainKnowledge(rs.getString("ref_domain_knowledge"))
            .createdAt(rs.getLong("created_at"))
            .build();

    private final JdbcTemplate jdbc;

    public ConsultTurnRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(ConsultTurn t) {
        jdbc.update(
                "INSERT INTO consult_turn (turn_id, session_id, turn_index, question, answer, " +
                "ref_menu_paths, ref_graphify_nodes, ref_domain_knowledge, created_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                t.getTurnId(), t.getSessionId(), t.getTurnIndex(), t.getQuestion(), t.getAnswer(),
                t.getRefMenuPaths(), t.getRefGraphifyNodes(), t.getRefDomainKnowledge(), t.getCreatedAt());
    }

    /** 某会话的全部轮次，按轮次序号升序。 */
    public List<ConsultTurn> findBySession(String sessionId) {
        return jdbc.query(
                "SELECT * FROM consult_turn WHERE session_id = ? ORDER BY turn_index ASC", ROW, sessionId);
    }

    public void deleteBySession(String sessionId) {
        jdbc.update("DELETE FROM consult_turn WHERE session_id = ?", sessionId);
    }
}
