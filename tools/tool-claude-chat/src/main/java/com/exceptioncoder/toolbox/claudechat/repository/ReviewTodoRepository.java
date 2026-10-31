package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewTodo;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

/** 本模块评审待办的版本与队列身份存储。 */
@Repository
public class ReviewTodoRepository {
    private static final RowMapper<ReviewTodo> ROW = (r, n) -> new ReviewTodo(r.getString("id"), r.getString("review_space_id"),
            r.getString("source_session_id"), r.getString("feedback_id"), r.getString("requirement_id"), r.getLong("source_revision"),
            r.getLong("version"), r.getString("title"), r.getString("content"), r.getString("status"), r.getString("message_id"),
            r.getString("note"), r.getLong("created_at"), r.getLong("updated_at"));
    private final JdbcTemplate jdbc;
    public ReviewTodoRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<ReviewTodo> list(String source) {
        return jdbc.query("SELECT * FROM claude_chat_review_todo WHERE source_session_id=? ORDER BY created_at,id", ROW, source);
    }
    public List<ReviewTodo> publicList(String space) {
        return jdbc.query("SELECT * FROM claude_chat_review_todo WHERE review_space_id=? ORDER BY created_at,id", ROW, space);
    }
    public Optional<ReviewTodo> find(String source, String id) {
        return jdbc.query("SELECT * FROM claude_chat_review_todo WHERE source_session_id=? AND id=?", ROW, source, id).stream().findFirst();
    }
    public void register(ReviewTodo task) {
        jdbc.update("UPDATE claude_chat_review_todo SET status='SUPERSEDED',note='评审已提交新版需求，旧版尚未执行',updated_at=? "
                + "WHERE review_space_id=? AND requirement_id=? AND source_revision<? AND status='WAITING'",
                task.updatedAt(), task.reviewSpaceId(), task.requirementId(), task.sourceRevision());
        jdbc.update("""
                INSERT OR IGNORE INTO claude_chat_review_todo
                (id,review_space_id,source_session_id,feedback_id,requirement_id,source_revision,version,title,content,status,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,'WAITING',?,?)
                """, task.id(), task.reviewSpaceId(), task.sourceSessionId(), task.feedbackId(), task.requirementId(),
                task.sourceRevision(), task.version(), task.title(), task.content(), task.createdAt(), task.updatedAt());
    }
    public void retireRemoved(String space, List<String> currentIds) {
        for (ReviewTodo task : publicList(space)) {
            if ("WAITING".equals(task.status()) && !currentIds.contains(task.requirementId())) {
                jdbc.update("UPDATE claude_chat_review_todo SET status='SUPERSEDED',note='评审清单已移除此需求',updated_at=? WHERE id=? AND status='WAITING'",
                        System.currentTimeMillis(), task.id());
            }
        }
    }
    public boolean edit(String source, String id, long version, String title, String content) {
        return jdbc.update("UPDATE claude_chat_review_todo SET title=?,content=?,version=version+1,updated_at=? WHERE source_session_id=? AND id=? AND version=? AND status='WAITING'",
                title, content, System.currentTimeMillis(), source, id, version) == 1;
    }
    public boolean approve(ReviewTodo task, String messageId) {
        return jdbc.update("UPDATE claude_chat_review_todo SET status='QUEUED',message_id=?,note=NULL,updated_at=? WHERE id=? AND version=? AND status='WAITING'",
                messageId, System.currentTimeMillis(), task.id(), task.version()) == 1;
    }
    public void progress(String source, String message, String state, String note) {
        jdbc.update("UPDATE claude_chat_review_todo SET status=?,note=?,updated_at=?,message_id=CASE WHEN ?='WAITING' THEN NULL ELSE message_id END "
                + "WHERE source_session_id=? AND message_id=? AND status IN ('QUEUED','RUNNING','EXCEPTION')",
                state, note, System.currentTimeMillis(), state, source, message);
    }
}
