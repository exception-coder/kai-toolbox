package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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
            .recognizedSystemName(rs.getString("recognized_system_name"))
            .recognizedModuleNames(rs.getString("recognized_module_names"))
            .problemCategory(rs.getString("problem_category"))
            .recognitionStatus(rs.getString("recognition_status"))
            .recognitionEvidence(rs.getString("recognition_evidence"))
            .traceId(rs.getString("trace_id"))
            .attachments(rs.getString("attachments"))
            .createdAt(rs.getLong("created_at"))
            .build();

    private final JdbcTemplate jdbc;

    public ConsultTurnRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(ConsultTurn t) {
        jdbc.update(
                "INSERT INTO consult_turn (turn_id, session_id, turn_index, question, answer, " +
                "ref_menu_paths, ref_graphify_nodes, ref_domain_knowledge, recognized_system_name, " +
                "recognized_module_names, problem_category, recognition_status, recognition_evidence, " +
                "trace_id, attachments, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                t.getTurnId(), t.getSessionId(), t.getTurnIndex(), t.getQuestion(), t.getAnswer(),
                t.getRefMenuPaths(), t.getRefGraphifyNodes(), t.getRefDomainKnowledge(),
                t.getRecognizedSystemName(), t.getRecognizedModuleNames(), t.getProblemCategory(),
                t.getRecognitionStatus(), t.getRecognitionEvidence(), t.getTraceId(), t.getAttachments(), t.getCreatedAt());
    }

    /** 某会话的全部轮次，按轮次序号升序。 */
    public List<ConsultTurn> findBySession(String sessionId) {
        return jdbc.query(
                "SELECT * FROM consult_turn WHERE session_id = ? ORDER BY turn_index ASC", ROW, sessionId);
    }

    /** 跨会话取有回答的轮次，最近优先。评测样本回捞用。 */
    public List<ConsultTurn> findAllAnswered(int limit) {
        return jdbc.query("SELECT * FROM consult_turn WHERE answer IS NOT NULL AND TRIM(answer) <> '' "
                + "ORDER BY created_at DESC LIMIT ?", ROW, limit);
    }

    /** 批量统计历史列表中的问答轮数，避免列表逐条查询或加载完整回答正文。 */
    public Map<String, Integer> countBySessions(List<String> sessionIds) {
        if (sessionIds == null || sessionIds.isEmpty()) return Map.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(sessionIds.size(), "?"));
        return jdbc.query(
                        "SELECT session_id, COUNT(1) AS turn_count FROM consult_turn "
                                + "WHERE session_id IN (" + placeholders + ") GROUP BY session_id",
                        (rs, i) -> Map.entry(rs.getString("session_id"), rs.getInt("turn_count")),
                        sessionIds.toArray())
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    public int countBySession(String sessionId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(1) FROM consult_turn WHERE session_id = ?", Integer.class, sessionId);
        return count == null ? 0 : count;
    }

    public void deleteBySession(String sessionId) {
        jdbc.update("DELETE FROM consult_turn WHERE session_id = ?", sessionId);
    }
}
