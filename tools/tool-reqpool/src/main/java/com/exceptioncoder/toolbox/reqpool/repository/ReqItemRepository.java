package com.exceptioncoder.toolbox.reqpool.repository;

import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Repository
public class ReqItemRepository {

    private static final RowMapper<ReqItem> ROW = (rs, i) -> ReqItem.builder()
            .id(rs.getString("id"))
            .title(rs.getString("title"))
            .description(rs.getString("description"))
            .project(rs.getString("project"))
            .module(rs.getString("module"))
            .priority(rs.getString("priority"))
            .status(rs.getString("status"))
            .assignee(rs.getString("assignee"))
            .deadline(rs.getString("deadline"))
            .prdSessionId(rs.getString("prd_session_id"))
            .tags(rs.getString("tags"))
            .aiInsight(rs.getString("ai_insight"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    private final JdbcTemplate jdbc;

    public ReqItemRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(ReqItem item) {
        jdbc.update("""
                INSERT INTO req_pool_item
                  (id, title, description, project, module, priority, status,
                   assignee, deadline, prd_session_id, tags, ai_insight, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                item.getId(), item.getTitle(), item.getDescription(),
                item.getProject(), item.getModule(), item.getPriority(), item.getStatus(),
                item.getAssignee(), item.getDeadline(), item.getPrdSessionId(),
                item.getTags(), item.getAiInsight(), item.getCreatedAt(), item.getUpdatedAt());
    }

    /** 更新 AI 洞察分析 JSON。 */
    public void updateAiInsight(String id, String aiInsightJson) {
        jdbc.update("UPDATE req_pool_item SET ai_insight = ?, updated_at = ? WHERE id = ?",
                aiInsightJson, System.currentTimeMillis(), id);
    }

    public Optional<ReqItem> findById(String id) {
        List<ReqItem> rows = jdbc.query(
                "SELECT * FROM req_pool_item WHERE id = ?", ROW, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /**
     * 查询列表，支持按 status / project / priority 过滤，按创建时间倒序。
     */
    public List<ReqItem> findAll(String status, String project, String priority) {
        List<Object> params = new ArrayList<>();
        StringBuilder sql = new StringBuilder("SELECT * FROM req_pool_item WHERE 1=1");
        if (status != null && !status.isBlank()) {
            sql.append(" AND status = ?");
            params.add(status);
        }
        if (project != null && !project.isBlank()) {
            sql.append(" AND project = ?");
            params.add(project);
        }
        if (priority != null && !priority.isBlank()) {
            sql.append(" AND priority = ?");
            params.add(priority);
        }
        sql.append(" ORDER BY created_at DESC");
        return jdbc.query(sql.toString(), ROW, params.toArray());
    }

    public void update(ReqItem item) {
        jdbc.update("""
                UPDATE req_pool_item SET
                  title=?, description=?, project=?, module=?, priority=?, status=?,
                  assignee=?, deadline=?, prd_session_id=?, tags=?, updated_at=?
                WHERE id=?
                """,
                item.getTitle(), item.getDescription(),
                item.getProject(), item.getModule(), item.getPriority(), item.getStatus(),
                item.getAssignee(), item.getDeadline(), item.getPrdSessionId(),
                item.getTags(), item.getUpdatedAt(), item.getId());
    }

    /** 将需求状态更新为澄清中，并记录此时还未关联 PRD。 */
    public void markClarifying(String id) {
        jdbc.update("UPDATE req_pool_item SET status='CLARIFYING', updated_at=? WHERE id=?",
                System.currentTimeMillis(), id);
    }

    /** 澄清完成，关联 PRD，状态流转到 PRD_READY。 */
    public void linkPrd(String id, String prdSessionId) {
        jdbc.update("""
                UPDATE req_pool_item SET prd_session_id=?, status='PRD_READY', updated_at=?
                WHERE id=?
                """, prdSessionId, System.currentTimeMillis(), id);
    }

    public void delete(String id) {
        jdbc.update("DELETE FROM req_pool_item WHERE id=?", id);
    }

    public int count() {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM req_pool_item", Integer.class);
        return n == null ? 0 : n;
    }
}
