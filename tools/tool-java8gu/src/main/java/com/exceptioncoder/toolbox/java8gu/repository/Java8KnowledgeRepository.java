package com.exceptioncoder.toolbox.java8gu.repository;

import com.exceptioncoder.toolbox.java8gu.domain.Java8Knowledge.Example;
import com.exceptioncoder.toolbox.java8gu.domain.Java8Knowledge.Interview;
import com.exceptioncoder.toolbox.java8gu.domain.Java8Knowledge.Node;
import com.exceptioncoder.toolbox.java8gu.domain.Java8Knowledge.Relation;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** Java 8 知识节点的 SQLite 仓储。 */
@Repository
public class Java8KnowledgeRepository {

    private static final String NODE_COLUMNS =
            "id, title, summary, content, node_type, level, parent_id, sort_order";

    private final JdbcTemplate jdbc;

    public Java8KnowledgeRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 查询全部节点并保持树构建所需顺序。 */
    public List<Node> findAllNodes() {
        return jdbc.query("SELECT " + NODE_COLUMNS + " FROM java8_node ORDER BY level, sort_order, title",
                (rs, rowNum) -> mapNode(rs));
    }

    /** 按稳定 ID 查询节点。 */
    public Optional<Node> findNode(String id) {
        try {
            return Optional.ofNullable(jdbc.queryForObject(
                    "SELECT " + NODE_COLUMNS + " FROM java8_node WHERE id = ?", (rs, rowNum) -> mapNode(rs), id));
        } catch (EmptyResultDataAccessException exception) {
            return Optional.empty();
        }
    }

    /** 查询节点的代码案例。 */
    public List<Example> findExamples(String nodeId) {
        return jdbc.query("""
                SELECT id, node_id, title, before_code, after_code, explanation
                FROM java8_example WHERE node_id = ? ORDER BY id
                """, (rs, rowNum) -> new Example(rs.getLong("id"), rs.getString("node_id"),
                rs.getString("title"), rs.getString("before_code"), rs.getString("after_code"),
                rs.getString("explanation")), nodeId);
    }

    /** 查询节点的面试卡片。 */
    public List<Interview> findInterviews(String nodeId) {
        return jdbc.query("""
                SELECT id, node_id, question, short_answer, detail_answer, project_answer
                FROM java8_interview WHERE node_id = ? ORDER BY id
                """, (rs, rowNum) -> new Interview(rs.getLong("id"), rs.getString("node_id"),
                rs.getString("question"), rs.getString("short_answer"), rs.getString("detail_answer"),
                rs.getString("project_answer")), nodeId);
    }

    /** 双向查询关联节点。 */
    public List<Relation> findRelations(String nodeId) {
        return jdbc.query("""
                SELECT r.id, r.relation_type,
                       CASE WHEN r.source_id = ? THEN 'OUTGOING' ELSE 'INCOMING' END AS direction,
                       n.id, n.title, n.summary, n.content, n.node_type, n.level, n.parent_id, n.sort_order
                FROM java8_relation r
                JOIN java8_node n ON n.id = CASE WHEN r.source_id = ? THEN r.target_id ELSE r.source_id END
                WHERE r.source_id = ? OR r.target_id = ?
                ORDER BY r.id
                """, (rs, rowNum) -> new Relation(rs.getLong(1), rs.getString(2), rs.getString(3), mapNode(rs, 4)),
                nodeId, nodeId, nodeId, nodeId);
    }

    /** 仅当稳定 ID 不存在时写入种子节点。 */
    public void insertNodeIfAbsent(Node node) {
        String now = Instant.now().toString();
        jdbc.update("""
                INSERT OR IGNORE INTO java8_node
                (id, title, summary, content, node_type, level, parent_id, sort_order, create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, node.id(), node.title(), node.summary(), node.content(), node.nodeType(), node.level(),
                node.parentId(), node.sortOrder(), now, now);
    }

    /** 仅当节点尚无案例时写入种子案例。 */
    public void insertExampleIfAbsent(String nodeId, String title, String beforeCode, String afterCode,
                                      String explanation) {
        String now = Instant.now().toString();
        jdbc.update("""
                INSERT INTO java8_example
                (node_id, title, before_code, after_code, explanation, create_time, update_time)
                SELECT ?, ?, ?, ?, ?, ?, ?
                WHERE NOT EXISTS (SELECT 1 FROM java8_example WHERE node_id = ? AND title = ?)
                """, nodeId, title, beforeCode, afterCode, explanation, now, now, nodeId, title);
    }

    /** 仅当问题尚不存在时写入种子面试卡片。 */
    public void insertInterviewIfAbsent(String nodeId, String question, String shortAnswer, String detailAnswer,
                                        String projectAnswer) {
        String now = Instant.now().toString();
        jdbc.update("""
                INSERT INTO java8_interview
                (node_id, question, short_answer, detail_answer, project_answer, create_time, update_time)
                SELECT ?, ?, ?, ?, ?, ?, ?
                WHERE NOT EXISTS (SELECT 1 FROM java8_interview WHERE node_id = ? AND question = ?)
                """, nodeId, question, shortAnswer, detailAnswer, projectAnswer, now, now, nodeId, question);
    }

    /** 仅当同类型边不存在时写入关系。 */
    public void insertRelationIfAbsent(String sourceId, String targetId, String relationType) {
        String now = Instant.now().toString();
        jdbc.update("""
                INSERT OR IGNORE INTO java8_relation
                (source_id, target_id, relation_type, create_time, update_time) VALUES (?, ?, ?, ?, ?)
                """, sourceId, targetId, relationType, now, now);
    }

    private Node mapNode(java.sql.ResultSet rs) throws java.sql.SQLException {
        return mapNode(rs, 1);
    }

    private Node mapNode(java.sql.ResultSet rs, int offset) throws java.sql.SQLException {
        return new Node(rs.getString(offset), rs.getString(offset + 1), rs.getString(offset + 2),
                rs.getString(offset + 3), rs.getString(offset + 4), rs.getInt(offset + 5),
                rs.getString(offset + 6), rs.getInt(offset + 7));
    }
}
